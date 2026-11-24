// Byte-budgeted LRU. Map insertion order is the recency order (oldest first).

export class LruCache {
  constructor(budgetBytes) {
    this.budget = budgetBytes;
    this.usedBytes = 0;
    this.map = new Map(); // key -> { value, bytes }
    this.pins = new Map(); // key -> count
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  has(key) {
    return this.map.has(key);
  }

  set(key, value, bytes) {
    this.delete(key);
    this.map.set(key, { value, bytes });
    this.usedBytes += bytes;
    this.trim(key);
  }

  delete(key) {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.usedBytes -= e.bytes;
  }

  pin(key) {
    this.pins.set(key, (this.pins.get(key) || 0) + 1);
  }

  unpin(key) {
    const n = (this.pins.get(key) || 0) - 1;
    if (n > 0) this.pins.set(key, n);
    else this.pins.delete(key);
  }

  setBudget(bytes) {
    this.budget = bytes;
    this.trim();
  }

  trim(keep) {
    if (this.usedBytes <= this.budget) return;
    for (const key of [...this.map.keys()]) {
      if (this.usedBytes <= this.budget) break;
      if (key !== keep && !this.pins.has(key)) this.delete(key);
    }
  }
}
