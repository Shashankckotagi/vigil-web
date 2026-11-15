import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ControlBar } from '../../components/ControlBar';

describe('ControlBar Component', () => {
  const defaultProps = {
    url: 'https://www.youtube.com/live/EO_1LWqsCNE',
    setUrl: vi.fn(),
    tau: 0.92,
    setTau: vi.fn(),
    provider: 'mock',
    setProvider: vi.fn(),
    apiKey: '',
    setApiKey: vi.fn(),
    runId: '',
    setRunId: vi.fn(),
    backendUrl: '',
    setBackendUrl: vi.fn(),
    audio: true,
    setAudio: vi.fn(),
    escalation: true,
    setEscalation: vi.fn(),
    gate: true,
    setGate: vi.fn(),
    bounded: true,
    setBounded: vi.fn(),
    isRunning: false,
    isStarting: false,
    isUploading: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onUploadFile: vi.fn(),
    errorMessage: null,
    setErrorMessage: vi.fn(),
  };

  it('renders target URL input with initial value', () => {
    render(<ControlBar {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Enter YouTube live URL/i) as HTMLInputElement;
    expect(input.value).toBe('https://www.youtube.com/live/EO_1LWqsCNE');

    fireEvent.change(input, { target: { value: 'sample/demo_clip.avi' } });
    expect(defaultProps.setUrl).toHaveBeenCalledWith('sample/demo_clip.avi');
  });

  it('renders all 3 quick presets and clicking them updates URL', () => {
    render(<ControlBar {...defaultProps} />);
    const youtubePreset = screen.getByText(/YouTube Live Stream/i);
    const demoClipPreset = screen.getByText(/Bundled Demo Clip/i);
    const webcamPreset = screen.getByText(/USB Webcam/i);

    expect(youtubePreset).toBeInTheDocument();
    expect(demoClipPreset).toBeInTheDocument();
    expect(webcamPreset).toBeInTheDocument();

    fireEvent.click(demoClipPreset);
    expect(defaultProps.setUrl).toHaveBeenCalledWith('sample/demo_clip.avi');

    fireEvent.click(webcamPreset);
    expect(defaultProps.setUrl).toHaveBeenCalledWith('0');
  });

  it('enables Start Stream and disables Stop when idle', () => {
    render(<ControlBar {...defaultProps} isRunning={false} />);
    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    const stopBtn = screen.getByRole('button', { name: /Stop/i });

    expect(startBtn).not.toBeDisabled();
    expect(stopBtn).toBeDisabled();

    fireEvent.click(startBtn);
    expect(defaultProps.onStart).toHaveBeenCalled();
  });

  it('disables Start Stream and enables Stop when running', () => {
    render(<ControlBar {...defaultProps} isRunning={true} />);
    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    const stopBtn = screen.getByRole('button', { name: /Stop/i });

    expect(startBtn).toBeDisabled();
    expect(stopBtn).not.toBeDisabled();

    fireEvent.click(stopBtn);
    expect(defaultProps.onStop).toHaveBeenCalled();
  });

  it('triggers file picker when Upload Video is clicked', () => {
    render(<ControlBar {...defaultProps} />);
    const uploadBtn = screen.getByTitle('Upload local video file');
    const fileInput = document.getElementById('filePicker') as HTMLInputElement;

    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(defaultProps.onUploadFile).toHaveBeenCalledWith(file);
  });

  it('toggles advanced tuning parameters drawer', () => {
    render(<ControlBar {...defaultProps} />);
    const toggleBtn = screen.getByTitle('Toggle advanced tuning parameters');

    expect(screen.queryByLabelText(/Inference Provider/i)).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Inference Provider/i)).toBeInTheDocument();
    expect(screen.getByText(/SSIM Gating Threshold/i)).toBeInTheDocument();
    expect(screen.getByText('0.92')).toBeInTheDocument();
  });

  it('updates tau slider and calls setTau', () => {
    render(<ControlBar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));

    const slider = document.getElementById('tau') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(slider.value).toBe('0.92');

    fireEvent.change(slider, { target: { value: '0.85' } });
    expect(defaultProps.setTau).toHaveBeenCalledWith(0.85);
  });

  it('shows Gemini API Key input only when provider is gemini', () => {
    const { rerender } = render(<ControlBar {...defaultProps} provider="mock" />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));
    expect(screen.queryByPlaceholderText(/Paste Gemini API Key/i)).not.toBeInTheDocument();

    rerender(<ControlBar {...defaultProps} provider="gemini" />);
    expect(screen.getByPlaceholderText(/Paste Gemini API Key/i)).toBeInTheDocument();
  });

  it('toggles password visibility for Gemini API key', () => {
    render(<ControlBar {...defaultProps} provider="gemini" apiKey="AIzaSy123" />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));

    const apiKeyInput = screen.getByPlaceholderText(/Paste Gemini API Key/i) as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    // Click reveal eye icon
    const toggleEye = apiKeyInput.parentElement?.querySelector('button');
    expect(toggleEye).toBeDefined();
    if (toggleEye) fireEvent.click(toggleEye);

    expect(apiKeyInput.type).toBe('text');
  });

  it('renders all 4 feature toggles and toggles them', () => {
    render(<ControlBar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));

    const audioToggle = document.getElementById('audio') as HTMLInputElement;
    const escToggle = document.getElementById('esc') as HTMLInputElement;
    const gateToggle = document.getElementById('gate') as HTMLInputElement;
    const boundedToggle = document.getElementById('bounded') as HTMLInputElement;

    expect(audioToggle.checked).toBe(true);
    expect(escToggle.checked).toBe(true);
    expect(gateToggle.checked).toBe(true);
    expect(boundedToggle.checked).toBe(true);

    fireEvent.click(audioToggle);
    expect(defaultProps.setAudio).toHaveBeenCalledWith(false);

    fireEvent.click(escToggle);
    expect(defaultProps.setEscalation).toHaveBeenCalledWith(false);

    fireEvent.click(gateToggle);
    expect(defaultProps.setGate).toHaveBeenCalledWith(false);

    fireEvent.click(boundedToggle);
    expect(defaultProps.setBounded).toHaveBeenCalledWith(false);
  });

  it('displays and dismisses error banner', () => {
    render(<ControlBar {...defaultProps} errorMessage="Connection refused by backend" />);
    const banner = screen.getByText('Connection refused by backend');
    expect(banner).toBeInTheDocument();

    const dismissBtn = screen.getByText('Dismiss');
    fireEvent.click(dismissBtn);
    expect(defaultProps.setErrorMessage).toHaveBeenCalledWith(null);
  });

  it('disables Start Stream and displays warning banner when Gemini provider is selected without an API key', () => {
    render(<ControlBar {...defaultProps} provider="gemini" apiKey="" />);
    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    expect(startBtn).toBeDisabled();

    const banner = document.getElementById('apiKeyRequiredBanner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Gemini API Key Required/i);
  });

  it('enables Start Stream when Gemini API key is configured', () => {
    render(<ControlBar {...defaultProps} provider="gemini" apiKey="AIzaSy_valid_configured_key" />);
    const startBtn = screen.getByRole('button', { name: /Start Stream/i });
    expect(startBtn).not.toBeDisabled();
    expect(document.getElementById('apiKeyRequiredBanner')).toBeNull();
  });

  it('renders Gemini model variant selector and updates selected model', () => {
    const setModelMock = vi.fn();
    render(<ControlBar {...defaultProps} provider="gemini" model="gemini-2.5-flash" setModel={setModelMock} />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));

    const modelSelect = document.getElementById('geminiModelSelect') as HTMLSelectElement;
    expect(modelSelect).toBeInTheDocument();
    expect(modelSelect.value).toBe('gemini-2.5-flash');

    fireEvent.change(modelSelect, { target: { value: 'gemini-2.5-pro' } });
    expect(setModelMock).toHaveBeenCalledWith('gemini-2.5-pro');
  });

  it('provides a functional Verify Key button for Gemini credentials', async () => {
    render(<ControlBar {...defaultProps} provider="gemini" apiKey="AIzaSy_test_key" />);
    fireEvent.click(screen.getByTitle('Toggle advanced tuning parameters'));

    const verifyBtn = document.getElementById('btnVerifyKey');
    expect(verifyBtn).toBeInTheDocument();
    expect(verifyBtn).not.toBeDisabled();
  });
});
