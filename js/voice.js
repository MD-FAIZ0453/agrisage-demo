// Speech behind a small provider interface so the field build can swap in
// on-device Tamil ASR/TTS. This demo uses the browser's Web Speech API:
// speech synthesis runs on the device; speech recognition may use the
// browser vendor's online service, which the footer discloses.

const Rec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voice = {
  canListen: Boolean(Rec),
  canSpeak: typeof window !== 'undefined' && 'speechSynthesis' in window,
  rec: null,

  listen(lang, { onResult, onEnd, onError }) {
    if (!Rec) return false;
    this.stopListening();
    const rec = new Rec();
    rec.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onResult?.(finalText || interim, Boolean(finalText));
    };
    rec.onerror = (e) => onError?.(e.error);
    rec.onend = () => {
      this.rec = null;
      onEnd?.(finalText);
    };
    this.rec = rec;
    rec.start();
    return true;
  },

  stopListening() {
    if (this.rec) {
      try {
        this.rec.stop();
      } catch {
        /* already stopped */
      }
    }
  },

  speak(text, lang) {
    if (!this.canSpeak) return;
    const plain = text.replace(/\*\*|_/g, '').replace(/•/g, '').replace(/\n+/g, '. ');
    const u = new SpeechSynthesisUtterance(plain);
    const want = lang === 'ta' ? 'ta' : 'en-IN';
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang.toLowerCase().startsWith(want.toLowerCase())) || voices.find((v) => v.lang.startsWith(lang === 'ta' ? 'ta' : 'en')) || null;
    u.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  },

  stopSpeaking() {
    if (this.canSpeak) window.speechSynthesis.cancel();
  },
};
