export async function getAyahAudio(surah: number, ayah: number): Promise<string | null> {
  try {
    // Reciter 12 is Mahmoud Khalil Al-Husary
    const res = await fetch(`https://api.quran.com/api/v4/recitations/12/by_ayah/${surah}:${ayah}`);
    const data = await res.json();
    if (data.audio_files && data.audio_files.length > 0) {
      let url = data.audio_files[0].url;
      if (url.startsWith('//')) {
        url = 'https:' + url;
      }
      return url;
    }
    return null;
  } catch (err) {
    console.error('Failed to get Ayah audio', err);
    return null;
  }
}
