//! Auto push-to-talk: press or release the user's voice-chat PTT key (or mouse
//! side button) while a sound is playing into the cable output.

/// One physical input: a virtual-key code, or a mouse X button (1 or 2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    Key(u16),
    XButton(u16),
}

/// Parse a frontend accelerator ("Ctrl+F13", "Numpad0", "Mouse4") into inputs,
/// modifiers first. Returns None for anything we can't synthesize.
pub fn parse(acc: &str) -> Option<Vec<Input>> {
    if acc.is_empty() {
        return None;
    }
    let mut out = Vec::new();
    for part in acc.split('+') {
        out.push(input_for(part)?);
    }
    Some(out)
}

fn input_for(part: &str) -> Option<Input> {
    let vk: u16 = match part {
        "Ctrl" => 0x11,
        "Alt" => 0x12,
        "Shift" => 0x10,
        "Super" => 0x5B,
        "Mouse4" => return Some(Input::XButton(1)),
        "Mouse5" => return Some(Input::XButton(2)),
        "Space" => 0x20,
        "Enter" => 0x0D,
        "Tab" => 0x09,
        "Backspace" => 0x08,
        "Escape" => 0x1B,
        "Insert" => 0x2D,
        "Delete" => 0x2E,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "Up" => 0x26,
        "Down" => 0x28,
        "Left" => 0x25,
        "Right" => 0x27,
        "Pause" => 0x13,
        "ScrollLock" => 0x91,
        "PrintScreen" => 0x2C,
        "NumpadAdd" => 0x6B,
        "NumpadSubtract" => 0x6D,
        "NumpadMultiply" => 0x6A,
        "NumpadDivide" => 0x6F,
        "NumpadDecimal" => 0x6E,
        "NumpadEnter" => 0x0D,
        "`" => 0xC0,
        "-" => 0xBD,
        "=" => 0xBB,
        "[" => 0xDB,
        "]" => 0xDD,
        ";" => 0xBA,
        "'" => 0xDE,
        "," => 0xBC,
        "." => 0xBE,
        "/" => 0xBF,
        "\\" => 0xDC,
        p if p.len() == 1 && p.as_bytes()[0].is_ascii_alphanumeric() => p.as_bytes()[0].to_ascii_uppercase() as u16,
        p if p.starts_with("Numpad") => {
            let d: u16 = p[6..].parse().ok()?;
            if d > 9 {
                return None;
            }
            0x60 + d
        }
        p if p.starts_with('F') => {
            let n: u16 = p[1..].parse().ok()?;
            if !(1..=24).contains(&n) {
                return None;
            }
            0x6F + n
        }
        _ => return None,
    };
    Some(Input::Key(vk))
}

#[cfg(windows)]
pub fn send(inputs: &[Input], down: bool) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP, MOUSEEVENTF_XDOWN,
        MOUSEEVENTF_XUP, MOUSEINPUT,
    };
    // press modifiers first, release in reverse
    let ordered: Vec<Input> = if down { inputs.to_vec() } else { inputs.iter().rev().copied().collect() };
    let events: Vec<INPUT> = ordered
        .iter()
        .map(|i| match *i {
            Input::Key(vk) => INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if down { 0 } else { KEYEVENTF_KEYUP }, time: 0, dwExtraInfo: 0 },
                },
            },
            Input::XButton(b) => INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: b as u32,
                        dwFlags: if down { MOUSEEVENTF_XDOWN } else { MOUSEEVENTF_XUP },
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        })
        .collect();
    let sent = unsafe { SendInput(events.len() as u32, events.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == events.len() {
        Ok(())
    } else {
        Err("Windows blocked the key press (is the voice app running as administrator?)".into())
    }
}

#[cfg(not(windows))]
pub fn send(_inputs: &[Input], _down: bool) -> Result<(), String> {
    Err("Auto push-to-talk is only available on Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_keys_modifiers_and_mouse() {
        assert_eq!(parse("Ctrl+Shift+F13").unwrap(), vec![Input::Key(0x11), Input::Key(0x10), Input::Key(0x7C)]);
        assert_eq!(parse("Numpad0").unwrap(), vec![Input::Key(0x60)]);
        assert_eq!(parse("Mouse5").unwrap(), vec![Input::XButton(2)]);
        assert_eq!(parse("V").unwrap(), vec![Input::Key(0x56)]);
        assert_eq!(parse("Alt+`").unwrap(), vec![Input::Key(0x12), Input::Key(0xC0)]);
    }

    #[test]
    fn rejects_unknown() {
        assert!(parse("").is_none());
        assert!(parse("F25").is_none());
        assert!(parse("Ctrl+Hyper").is_none());
    }
}
