// Reconnaissance vocale d'iOS 26 (SpeechAnalyzer) : entièrement sur l'iPhone, rapide, sans connexion.
// Le micro est converti au format attendu par le modèle, puis le texte remonte au fil de la parole.
import AVFoundation
import Speech

@available(iOS 26.0, *)
final class NoemiaAnalyzer {
  private let onText: (String, Bool) -> Void
  private let onEnd: (String) -> Void
  private let onError: (String) -> Void

  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var results: Task<Void, Never>?
  private let engine = AVAudioEngine()
  private var converter: AVAudioConverter?
  private var format: AVAudioFormat?
  private var finalized = ""
  private var volatile = ""

  init(onText: @escaping (String, Bool) -> Void, onEnd: @escaping (String) -> Void, onError: @escaping (String) -> Void) {
    self.onText = onText; self.onEnd = onEnd; self.onError = onError
  }

  func start(locale: Locale) async throws {
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
    // Télécharge le modèle français la première fois (quelques Mo)
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await request.downloadAndInstall()
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    self.analyzer = analyzer
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      throw NSError(domain: "NOEMIA", code: 1, userInfo: [NSLocalizedDescriptionKey: "Format audio indisponible"])
    }
    self.format = format

    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    self.input = continuation
    finalized = ""; volatile = ""

    results = Task { [weak self] in
      do {
        for try await r in transcriber.results {
          guard let self else { return }
          let text = String(r.text.characters)
          if r.isFinal { self.finalized += text; self.volatile = "" } else { self.volatile = text }
          self.onText((self.finalized + self.volatile).trimmingCharacters(in: .whitespaces), r.isFinal)
        }
      } catch {
        self?.onError(error.localizedDescription)
      }
    }

    try await analyzer.start(inputSequence: stream)

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setActive(true)

    let node = engine.inputNode
    let micFormat = node.outputFormat(forBus: 0)
    converter = AVAudioConverter(from: micFormat, to: format)
    node.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [weak self] buffer, _ in
      self?.feed(buffer)
    }
    engine.prepare()
    try engine.start()
  }

  private func feed(_ buffer: AVAudioPCMBuffer) {
    guard let converter, let format, let input else { return }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
    var consumed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if consumed { status.pointee = .noDataNow; return nil }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    if error == nil, out.frameLength > 0 { input.yield(AnalyzerInput(buffer: out)) }
  }

  func stop() async {
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    input?.finish()
    try? await analyzer?.finalizeAndFinishThroughEndOfInput()
    results?.cancel()
    onEnd((finalized + volatile).trimmingCharacters(in: .whitespaces))
  }
}
