export async function playPcmAudio(base64Audio: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = audioCtx.createBuffer(1, float32Array.length, 24000);
      buffer.copyToChannel(float32Array, 0);
      
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      
      source.onended = () => {
        resolve();
      };
      
      source.start();
      
      (window as any).__currentPcmContext = audioCtx;
    } catch (err) {
      reject(err);
    }
  });
}

export function stopPcmAudio() {
  if ((window as any).__currentPcmContext) {
    try {
      ((window as any).__currentPcmContext as AudioContext).close();
    } catch (e) {}
    (window as any).__currentPcmContext = null;
  }
}

export function pausePcmAudio() {
  if ((window as any).__currentPcmContext) {
    try {
      ((window as any).__currentPcmContext as AudioContext).suspend();
    } catch (e) {}
  }
}

export function resumePcmAudio() {
  if ((window as any).__currentPcmContext) {
    try {
      ((window as any).__currentPcmContext as AudioContext).resume();
    } catch (e) {}
  }
}
