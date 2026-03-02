import SwiftUI
import Speech
import AVFoundation

/// Voice input button that uses iOS Speech framework for on-device transcription.
///
/// Falls back to recording audio and sending to the server's Whisper endpoint
/// if on-device transcription isn't available.
struct VoiceInputButton: View {
    let isTranscribing: Bool
    let onTranscription: (String) -> Void
    let onAudioData: (String) -> Void  // Base64-encoded audio for server transcription

    @State private var isRecording = false
    @State private var speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    @State private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @State private var recognitionTask: SFSpeechRecognitionTask?
    @State private var audioEngine = AVAudioEngine()
    @State private var permissionGranted = false
    @State private var currentTranscription = ""

    var body: some View {
        Button {
            if isRecording {
                stopRecording()
            } else {
                Task { await startRecording() }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(isRecording ? .red : .blue)
                    .frame(width: 36, height: 36)

                if isTranscribing {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.white)
                }
            }
        }
        .disabled(isTranscribing)
        .scaleEffect(isRecording ? 1.1 : 1.0)
        .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: isRecording)
        .task {
            await requestPermissions()
        }
    }

    // MARK: - Permissions

    private func requestPermissions() async {
        // Request microphone permission
        let audioStatus = AVAudioApplication.shared.recordPermission
        if audioStatus == .undetermined {
            let granted = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            if !granted { return }
        }

        // Request speech recognition permission
        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        if speechStatus == .notDetermined {
            let granted = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
            permissionGranted = granted
        } else {
            permissionGranted = speechStatus == .authorized
        }
    }

    // MARK: - Recording

    private func startRecording() async {
        guard permissionGranted else {
            await requestPermissions()
            return
        }

        guard let speechRecognizer, speechRecognizer.isAvailable else {
            // Fallback: record audio and send to server
            // TODO: Implement raw audio recording
            return
        }

        // Cancel any ongoing recognition
        recognitionTask?.cancel()
        recognitionTask = nil

        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else { return }

        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        audioEngine.prepare()
        try? audioEngine.start()

        isRecording = true
        currentTranscription = ""

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { result, error in
            if let result {
                currentTranscription = result.bestTranscription.formattedString
            }

            if error != nil || (result?.isFinal ?? false) {
                // Recognition finished
                audioEngine.stop()
                inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil
            }
        }

        // Auto-haptic on start
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
    }

    private func stopRecording() {
        audioEngine.stop()
        recognitionRequest?.endAudio()
        isRecording = false

        // Deliver the transcription
        if !currentTranscription.isEmpty {
            onTranscription(currentTranscription)
        }

        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}
