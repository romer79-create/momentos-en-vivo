const key = photo => `${photo.id}:${photo.publishedAt || photo.createdAt || ''}`;

// Only the server's approved feed enters this queue. Photos present on opening
// form the carousel; subsequent publications get one turn in the spotlight.
export class ProjectionQueue {
  initialized = false;
  photos = [];
  seen = new Set();
  admitted = new Set();
  waiting = [];
  current = null;
  sync(photos) {
    this.photos = photos;
    const allowed = new Set(photos.map(key));
    this.admitted = new Set([...this.admitted].filter(value => allowed.has(value)));
    this.waiting = this.waiting.filter(photo => allowed.has(key(photo)));
    if (this.current && !allowed.has(key(this.current))) this.current = null;
    for (const photo of [...photos].reverse()) {
      const value = key(photo);
      if (!this.initialized) this.admitted.add(value);
      else if (!this.seen.has(value)) this.waiting.push(photo);
      this.seen.add(value);
    }
    // One event has at most 3,000 photos; also bound repeated moderation changes.
    while (this.seen.size > 6000) this.seen.delete(this.seen.values().next().value);
    this.initialized = true;
  }
  carousel() { return this.photos.filter(photo => this.admitted.has(key(photo))); }
  next() { return this.current ||= this.waiting.shift() || null; }
  finish() { if (this.current) this.admitted.add(key(this.current)); this.current = null; }
  clear() { this.photos = []; this.waiting = []; this.current = null; this.admitted.clear(); this.seen.clear(); this.initialized = false; }
}
