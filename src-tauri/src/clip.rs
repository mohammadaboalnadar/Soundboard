//! "Clip that": while it is on, the last few seconds of what plays on the default
//! output (Discord, the game, anything) are kept in a fixed ring buffer, so one key
//! turns them into a pad. Capture is WASAPI loopback on its own thread; the buffer is
//! 16-bit stereo, allocated once and never grown, and freed when the feature is off.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

pub const MIN_SECONDS: u32 = 5;
pub const MAX_SECONDS: u32 = 60;

/// Interleaved 16-bit stereo, oldest frame at `pos` once the buffer has wrapped.
pub struct Ring {
    rate: u32,
    seconds: u32,
    data: Vec<i16>,
    pos: usize,
    filled: usize,
}

impl Ring {
    pub fn new(rate: u32, seconds: u32) -> Self {
        Ring { rate, seconds, data: vec![0; (rate * seconds) as usize * 2], pos: 0, filled: 0 }
    }

    fn frames(&self) -> usize {
        self.data.len() / 2
    }

    /// Switch to a new sample rate (another device): reallocate and start empty.
    pub fn set_rate(&mut self, rate: u32) {
        if rate != self.rate {
            *self = Ring::new(rate, self.seconds);
        }
    }

    pub fn push(&mut self, l: i16, r: i16) {
        let cap = self.frames();
        if cap == 0 {
            return;
        }
        self.data[self.pos * 2] = l;
        self.data[self.pos * 2 + 1] = r;
        self.pos = (self.pos + 1) % cap;
        self.filled = (self.filled + 1).min(cap);
    }

    pub fn push_silence(&mut self, frames: usize) {
        for _ in 0..frames.min(self.frames()) {
            self.push(0, 0);
        }
    }

    pub fn rate(&self) -> u32 {
        self.rate
    }

    pub fn filled(&self) -> usize {
        self.filled
    }

    /// The buffered audio in playing order.
    pub fn snapshot(&self) -> Vec<i16> {
        let cap = self.frames();
        let start = (self.pos + cap - self.filled) % cap.max(1);
        let mut out = Vec::with_capacity(self.filled * 2);
        for i in 0..self.filled {
            let f = (start + i) % cap;
            out.push(self.data[f * 2]);
            out.push(self.data[f * 2 + 1]);
        }
        out
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SampleFormat {
    F32,
    I16,
    I32,
    I24,
}

fn to_i16(v: f32) -> i16 {
    (v.clamp(-1.0, 1.0) * 32767.0).round() as i16
}

/// Append raw device frames to the ring, keeping the first two channels (mono is doubled).
pub fn push_frames(ring: &mut Ring, data: &[u8], fmt: SampleFormat, channels: usize) {
    let bytes = match fmt {
        SampleFormat::F32 | SampleFormat::I32 => 4,
        SampleFormat::I24 => 3,
        SampleFormat::I16 => 2,
    };
    let frame = bytes * channels.max(1);
    let read = |b: &[u8]| -> i16 {
        match fmt {
            SampleFormat::F32 => to_i16(f32::from_le_bytes([b[0], b[1], b[2], b[3]])),
            SampleFormat::I16 => i16::from_le_bytes([b[0], b[1]]),
            SampleFormat::I32 => (i32::from_le_bytes([b[0], b[1], b[2], b[3]]) >> 16) as i16,
            SampleFormat::I24 => i16::from_le_bytes([b[1], b[2]]),
        }
    };
    for f in data.chunks_exact(frame) {
        let l = read(&f[..bytes]);
        let r = if channels > 1 { read(&f[bytes..bytes * 2]) } else { l };
        ring.push(l, r);
    }
}

/// A 16-bit stereo PCM WAV file.
pub fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 4).to_le_bytes());
    out.extend_from_slice(&4u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

struct Running {
    seconds: u32,
    stop: Arc<AtomicBool>,
    ring: Arc<Mutex<Ring>>,
    thread: Option<JoinHandle<()>>,
}

impl Running {
    fn shut(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

#[derive(Default)]
pub struct Clip {
    inner: Mutex<Option<Running>>,
}

impl Clip {
    /// Turn capture on with a buffer of `seconds`, or off (which frees the buffer).
    pub fn set(&self, enabled: bool, seconds: u32) {
        let seconds = seconds.clamp(MIN_SECONDS, MAX_SECONDS);
        let mut inner = self.inner.lock().unwrap();
        if enabled && inner.as_ref().is_some_and(|r| r.seconds == seconds) {
            return;
        }
        if let Some(r) = inner.take() {
            r.shut();
        }
        if !enabled {
            return;
        }
        let stop = Arc::new(AtomicBool::new(false));
        let ring = Arc::new(Mutex::new(Ring::new(48_000, seconds)));
        let thread = {
            let (stop, ring) = (stop.clone(), ring.clone());
            std::thread::Builder::new().name("clip-capture".into()).spawn(move || capture::run(&stop, &ring)).ok()
        };
        *inner = Some(Running { seconds, stop, ring, thread });
    }

    /// The buffered seconds as a WAV file.
    pub fn take_wav(&self) -> Result<Vec<u8>, String> {
        let inner = self.inner.lock().unwrap();
        let r = inner.as_ref().ok_or("Clip that is off. Turn it on in Settings first.")?;
        let ring = r.ring.lock().unwrap();
        if ring.filled() < ring.rate() as usize / 2 {
            return Err("Nothing to clip yet: it has only just started listening.".into());
        }
        let samples = ring.snapshot();
        let rate = ring.rate();
        drop(ring);
        if samples.iter().all(|&s| s.unsigned_abs() < 8) {
            return Err("Nothing to clip: no sound played in the last few seconds.".into());
        }
        Ok(wav(&samples, rate))
    }

    pub fn stop(&self) {
        if let Some(r) = self.inner.lock().unwrap().take() {
            r.shut();
        }
    }
}

#[cfg(windows)]
mod capture {
    use super::{push_frames, Ring, SampleFormat};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::core::GUID;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};

    const FLOAT_SUBTYPE: GUID = GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);
    const PCM_SUBTYPE: GUID = GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);
    const SILENT: u32 = 0x2; // AUDCLNT_BUFFERFLAGS_SILENT

    pub fn run(stop: &AtomicBool, ring: &Mutex<Ring>) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        while !stop.load(Ordering::Relaxed) {
            // Ends when the device goes away or the default output changes; then reopen.
            let _ = unsafe { session(stop, ring) };
            sleep_unless(stop, Duration::from_millis(1000));
        }
        unsafe { CoUninitialize() };
    }

    fn sleep_unless(stop: &AtomicBool, d: Duration) {
        let end = Instant::now() + d;
        while !stop.load(Ordering::Relaxed) && Instant::now() < end {
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    unsafe fn device_id(dev: &IMMDevice) -> String {
        match dev.GetId() {
            Ok(p) => {
                let s = p.to_string().unwrap_or_default();
                CoTaskMemFree(Some(p.0 as *const _));
                s
            }
            Err(_) => String::new(),
        }
    }

    unsafe fn format(fmt: *const WAVEFORMATEX) -> Option<(SampleFormat, usize, u32)> {
        let f = std::ptr::read_unaligned(fmt);
        let (tag, bits) = (f.wFormatTag, f.wBitsPerSample);
        let kind = if tag == 0xFFFE {
            let ext = std::ptr::read_unaligned(fmt as *const WAVEFORMATEXTENSIBLE);
            let sub = ext.SubFormat;
            if sub == FLOAT_SUBTYPE { 3 } else if sub == PCM_SUBTYPE { 1 } else { 0 }
        } else {
            tag
        };
        let sf = match (kind, bits) {
            (3, 32) => SampleFormat::F32,
            (1, 16) => SampleFormat::I16,
            (1, 24) => SampleFormat::I24,
            (1, 32) => SampleFormat::I32,
            _ => return None,
        };
        Some((sf, f.nChannels as usize, f.nSamplesPerSec))
    }

    unsafe fn session(stop: &AtomicBool, ring: &Mutex<Ring>) -> windows::core::Result<()> {
        let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let id = device_id(&dev);
        let client: IAudioClient = dev.Activate(CLSCTX_ALL, None)?;
        let mix = client.GetMixFormat()?;
        let parsed = format(mix);
        let init = client.Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 2_000_000, 0, mix, None);
        CoTaskMemFree(Some(mix as *const _));
        init?;
        let Some((fmt, channels, rate)) = parsed else { return Ok(()) };
        let block = channels * match fmt {
            SampleFormat::F32 | SampleFormat::I32 => 4,
            SampleFormat::I24 => 3,
            SampleFormat::I16 => 2,
        };
        ring.lock().unwrap().set_rate(rate);
        let cap: IAudioCaptureClient = client.GetService()?;
        client.Start()?;

        let mut last = Instant::now();
        let mut checked = Instant::now();
        let result = loop {
            if stop.load(Ordering::Relaxed) {
                break Ok(());
            }
            std::thread::sleep(Duration::from_millis(20));
            let mut got = false;
            loop {
                let n = match cap.GetNextPacketSize() {
                    Ok(n) => n,
                    Err(e) => return { let _ = client.Stop(); Err(e) },
                };
                if n == 0 {
                    break;
                }
                let mut data = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut flags = 0u32;
                cap.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                {
                    let mut r = ring.lock().unwrap();
                    if flags & SILENT != 0 || data.is_null() {
                        r.push_silence(frames as usize);
                    } else {
                        push_frames(&mut r, std::slice::from_raw_parts(data, frames as usize * block), fmt, channels);
                    }
                }
                cap.ReleaseBuffer(frames)?;
                got = true;
            }
            let now = Instant::now();
            if got {
                last = now;
            } else if now - last > Duration::from_millis(60) {
                // Loopback delivers nothing while the output is idle: keep time with silence.
                let frames = ((now - last).as_secs_f64() * rate as f64) as usize;
                ring.lock().unwrap().push_silence(frames);
                last = now;
            }
            if now - checked > Duration::from_secs(2) {
                checked = now;
                if let Ok(d) = en.GetDefaultAudioEndpoint(eRender, eConsole) {
                    if device_id(&d) != id {
                        break Ok(());
                    }
                }
            }
        };
        let _ = client.Stop();
        result
    }
}

#[cfg(not(windows))]
mod capture {
    pub fn run(_: &std::sync::atomic::AtomicBool, _: &std::sync::Mutex<super::Ring>) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_keeps_the_newest_frames_in_order() {
        let mut r = Ring::new(4, 1); // 4 frames
        for i in 1..=6 {
            r.push(i, -i);
        }
        assert_eq!(r.filled(), 4);
        assert_eq!(r.snapshot(), vec![3, -3, 4, -4, 5, -5, 6, -6]);
    }

    #[test]
    fn ring_size_is_fixed() {
        let mut r = Ring::new(48_000, 30);
        let before = r.data.capacity();
        r.push_silence(48_000 * 90);
        assert_eq!(r.data.capacity(), before);
        assert_eq!(before, 48_000 * 30 * 2);
    }

    #[test]
    fn converts_float_and_downmixes() {
        let mut r = Ring::new(8, 1);
        let mut bytes = Vec::new();
        for v in [1.0f32, -1.0, 0.0, 0.5, 0.5, 0.5] {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        push_frames(&mut r, &bytes, SampleFormat::F32, 3); // 2 frames of 3 channels
        assert_eq!(r.snapshot(), vec![32767, -32767, 16384, 16384]);
        let mut m = Ring::new(8, 1);
        push_frames(&mut m, &[0x00, 0x40], SampleFormat::I16, 1);
        assert_eq!(m.snapshot(), vec![0x4000, 0x4000]);
    }

    #[test]
    fn writes_a_valid_wav_header() {
        let w = wav(&[1, 2, 3, 4], 48_000);
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(&w[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes([w[24], w[25], w[26], w[27]]), 48_000);
        assert_eq!(u32::from_le_bytes([w[40], w[41], w[42], w[43]]), 8);
        assert_eq!(w.len(), 52);
    }

    #[test]
    fn off_means_no_clip() {
        let c = Clip::default();
        assert!(c.take_wav().is_err());
    }
}
