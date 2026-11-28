const ASSETS_BASE = 'assets';
const TYPING_RATES = [.96, .98, 1, 1.02, 1.04];

class AudioEngine {
  enabled = true;
  started = false;
  sounds = null;
  lastTypingPitch = 2;

  init() {
    if (!this.enabled || this.sounds || typeof Howl === 'undefined') return;
    const sample = (name, volume, loop = false) => new Howl({
      src: [`${ASSETS_BASE}/${name}.wav`], volume, loop,
    });
    this.sounds = {
      startup: sample('startup', .88),
      ambient: sample('ambient', .4, true),
      keyboard: sample('keyboard', .3),
      error: sample('error', .24),
      defeat: sample('signal-loss', .70),
    };
  }

  boot() {
    if (!this.enabled || this.started) return;
    this.init();
    if (!this.sounds) return;
    this.started = true;
    this.sounds.startup.play();
    this.sounds.ambient.play();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.sounds) return;
    this.sounds.ambient.mute(!enabled);
    if (!enabled) {
      this.sounds.startup.stop();
      this.sounds.keyboard.stop();
      this.sounds.error.stop();
      this.sounds.defeat.stop();
    }
  }

  type() {
    if (!this.enabled || !this.sounds) return;
    // Pick any pitch except the previous one, even when a key repeats.
    let pitch = Math.floor(Math.random() * (TYPING_RATES.length - 1));
    if (pitch >= this.lastTypingPitch) pitch++;
    this.lastTypingPitch = pitch;
    const key = this.sounds.keyboard;
    const id = key.play();
    key.rate(TYPING_RATES[pitch], id);
  }

  menuClick(confirm = false) {
    if (!this.enabled || !this.sounds) return;
    const key = this.sounds.keyboard;
    const id = key.play();
    key.volume(confirm ? .82 : .66, id);
    key.rate(confirm ? .90 : 1.13, id);
  }

  error() {
    if (!this.enabled || !this.sounds) return;
    this.sounds.error.stop();
    this.sounds.error.play();
  }

  defeat() {
    if (!this.enabled || !this.sounds) return;
    this.sounds.error.stop();
    this.sounds.startup.stop();
    this.sounds.defeat.play();
  }

  dispose() {
    if (this.sounds) Object.values(this.sounds).forEach(sound => sound.unload());
    this.sounds = null;
    this.started = false;
  }
}

export const audio = new AudioEngine();
