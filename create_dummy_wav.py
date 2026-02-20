
import wave
import struct

def create_dummy_wav(filename, duration=1):
    n_frames = int(duration * 44100)
    data = struct.pack('<' + ('h'*n_frames), *([0]*n_frames))
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(44100)
        wav_file.writeframes(data)
    print(f"Created {filename}")

if __name__ == "__main__":
    create_dummy_wav("test_audio.wav")
