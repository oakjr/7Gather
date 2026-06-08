import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MusicPlayer, MusicTrackInfo } from './MusicPlayer';

describe('MusicPlayer', () => {
  const defaultProps = {
    currentTrack: null as MusicTrackInfo | null,
    volume: 50,
    onVolumeChange: vi.fn(),
    onPlay: vi.fn(),
    onStop: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no track is playing', () => {
    it('renders URL input and file upload', () => {
      render(<MusicPlayer {...defaultProps} />);

      expect(screen.getByLabelText('URL de áudio')).toBeDefined();
      expect(screen.getByLabelText(/envie um arquivo/i)).toBeDefined();
    });

    it('renders play button', () => {
      render(<MusicPlayer {...defaultProps} />);

      expect(screen.getByRole('button', { name: /tocar/i })).toBeDefined();
    });

    it('calls onPlay with URL when form is submitted', () => {
      const onPlay = vi.fn();
      render(<MusicPlayer {...defaultProps} onPlay={onPlay} />);

      const input = screen.getByLabelText('URL de áudio');
      fireEvent.change(input, { target: { value: 'https://example.com/song.mp3' } });

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(onPlay).toHaveBeenCalledWith('https://example.com/song.mp3');
    });

    it('shows error for empty URL submission', () => {
      render(<MusicPlayer {...defaultProps} />);

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/insira uma url de áudio válida/i)).toBeDefined();
    });

    it('shows error for unsupported format', () => {
      render(<MusicPlayer {...defaultProps} />);

      const input = screen.getByLabelText('URL de áudio');
      fireEvent.change(input, { target: { value: 'https://example.com/file.txt' } });

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/formato não suportado/i)).toBeDefined();
    });

    it('accepts MP3 URLs', () => {
      const onPlay = vi.fn();
      render(<MusicPlayer {...defaultProps} onPlay={onPlay} />);

      const input = screen.getByLabelText('URL de áudio');
      fireEvent.change(input, { target: { value: 'https://cdn.example.com/track.mp3' } });

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(onPlay).toHaveBeenCalledWith('https://cdn.example.com/track.mp3');
    });

    it('accepts OGG URLs', () => {
      const onPlay = vi.fn();
      render(<MusicPlayer {...defaultProps} onPlay={onPlay} />);

      const input = screen.getByLabelText('URL de áudio');
      fireEvent.change(input, { target: { value: 'https://cdn.example.com/track.ogg' } });

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(onPlay).toHaveBeenCalledWith('https://cdn.example.com/track.ogg');
    });

    it('accepts WAV URLs', () => {
      const onPlay = vi.fn();
      render(<MusicPlayer {...defaultProps} onPlay={onPlay} />);

      const input = screen.getByLabelText('URL de áudio');
      fireEvent.change(input, { target: { value: 'https://cdn.example.com/track.wav' } });

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      expect(onPlay).toHaveBeenCalledWith('https://cdn.example.com/track.wav');
    });

    it('shows error for file with unsupported MIME type', () => {
      render(<MusicPlayer {...defaultProps} />);

      const fileInput = screen.getByLabelText(/envie um arquivo/i);
      const file = new File(['content'], 'file.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/formato não suportado/i)).toBeDefined();
    });

    it('calls onPlay when valid audio file is uploaded', () => {
      const onPlay = vi.fn();
      render(<MusicPlayer {...defaultProps} onPlay={onPlay} />);

      const fileInput = screen.getByLabelText(/envie um arquivo/i);
      const file = new File(['audio-data'], 'relaxing.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(onPlay).toHaveBeenCalledWith('relaxing.mp3');
    });
  });

  describe('when a track is playing', () => {
    const playingTrack: MusicTrackInfo = {
      source: 'https://example.com/lofi-beats.mp3',
      startedBy: 'Alice',
      isPlaying: true,
    };

    it('displays track name', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      expect(screen.getByText(/lofi-beats\.mp3/)).toBeDefined();
    });

    it('displays who started the track', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      expect(screen.getByText(/por Alice/)).toBeDefined();
    });

    it('renders volume slider', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      const slider = screen.getByRole('slider');
      expect(slider).toBeDefined();
      expect(slider.getAttribute('aria-valuenow')).toBe('50');
    });

    it('renders stop button', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      expect(screen.getByRole('button', { name: /parar/i })).toBeDefined();
    });

    it('calls onVolumeChange when slider is moved', () => {
      const onVolumeChange = vi.fn();
      render(
        <MusicPlayer
          {...defaultProps}
          currentTrack={playingTrack}
          onVolumeChange={onVolumeChange}
        />
      );

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '75' } });

      expect(onVolumeChange).toHaveBeenCalledWith(75);
    });

    it('calls onStop when stop button is clicked', () => {
      const onStop = vi.fn();
      render(
        <MusicPlayer {...defaultProps} currentTrack={playingTrack} onStop={onStop} />
      );

      const stopBtn = screen.getByRole('button', { name: /parar/i });
      fireEvent.click(stopBtn);

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('does not render URL input when track is playing', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      expect(screen.queryByLabelText('URL de áudio')).toBeNull();
    });

    it('displays volume percentage', () => {
      render(
        <MusicPlayer {...defaultProps} currentTrack={playingTrack} volume={75} />
      );

      expect(screen.getByText(/Volume: 75%/)).toBeDefined();
    });

    it('volume slider min is 0 and max is 100', () => {
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      const slider = screen.getByRole('slider');
      expect(slider.getAttribute('aria-valuemin')).toBe('0');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
    });
  });

  describe('accessibility', () => {
    it('has proper section landmark with label', () => {
      render(<MusicPlayer {...defaultProps} />);

      const section = screen.getByRole('region', { name: /player de música compartilhada/i });
      expect(section).toBeDefined();
    });

    it('has aria-live region for track changes', () => {
      const playingTrack: MusicTrackInfo = {
        source: 'https://example.com/song.mp3',
        startedBy: 'Bob',
        isPlaying: true,
      };
      render(<MusicPlayer {...defaultProps} currentTrack={playingTrack} />);

      const liveRegion = screen.getByText(/song\.mp3/).closest('[aria-live]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion!.getAttribute('aria-live')).toBe('polite');
    });

    it('error message has alert role', () => {
      render(<MusicPlayer {...defaultProps} />);

      const form = screen.getByRole('form', { name: /iniciar música por url/i });
      fireEvent.submit(form);

      const alert = screen.getByRole('alert');
      expect(alert).toBeDefined();
    });

    it('volume slider has descriptive aria-label', () => {
      const playingTrack: MusicTrackInfo = {
        source: 'https://example.com/song.mp3',
        startedBy: 'Charlie',
        isPlaying: true,
      };
      render(
        <MusicPlayer {...defaultProps} currentTrack={playingTrack} volume={60} />
      );

      const slider = screen.getByRole('slider');
      expect(slider.getAttribute('aria-label')).toBe('Volume da música: 60%');
    });
  });
});
