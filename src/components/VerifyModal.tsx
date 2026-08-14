import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Mic, Loader2, X, Check, AlertCircle, Zap, ShieldCheck } from 'lucide-react'
import type { Quest, VerificationKind } from '../types'
import { ApiError, verifyTask, type Verdict } from '../lib/api'
import { prepareImage } from '../lib/image'
import { VERIFY_BONUS_XP } from '../hooks/useAppState'

interface Props {
  quest: Quest
  onClose: () => void
  onVerified: (kind: VerificationKind, note: string) => void
}

type Mode = 'choose' | 'photo' | 'voice'
type Phase = 'idle' | 'listening' | 'checking' | 'done'

/** Minimal shape of the Web Speech API surface we use — it isn't in lib.dom. */
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function VerifyModal({ quest, onClose, onVerified }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // What was actually submitted, so the reward shown always matches the reward
  // paid. Reading the UI mode here would drift if the two ever disagree.
  const [verdictKind, setVerdictKind] = useState<'photo' | 'voice'>('photo')
  const [preview, setPreview] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const speechSupported = Boolean(getSpeechRecognition())

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  async function submit(payload: Parameters<typeof verifyTask>[0]) {
    setPhase('checking')
    setError(null)
    try {
      const result = await verifyTask(payload)
      setVerdictKind(payload.kind)
      setVerdict(result)
      setPhase('done')
      if (result.verified) {
        onVerified(payload.kind, result.reason)
      }
    } catch (err) {
      setPhase('idle')
      if (err instanceof ApiError && err.status === 503) {
        setError('Proof checking is not switched on for this app yet.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    }
  }

  async function handleFile(file: File) {
    setError(null)
    try {
      const { base64, mediaType, capturedAt } = await prepareImage(file)
      setPreview(`data:${mediaType};base64,${base64}`)
      await submit({ kind: 'photo', taskTitle: quest.title, imageBase64: base64, mediaType, capturedAt })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  function startListening() {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return
    setError(null)
    setTranscript('')

    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true

    let finalText = ''
    recognition.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      finalText = text
      setTranscript(text)
    }
    recognition.onerror = (e) => {
      setPhase('idle')
      setError(
        e.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings.'
          : 'Could not hear anything. Try again.',
      )
    }
    recognition.onend = () => {
      if (finalText.trim().length >= 2) {
        void submit({ kind: 'voice', taskTitle: quest.title, transcript: finalText })
      } else {
        setPhase('idle')
      }
    }

    setPhase('listening')
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  const busy = phase === 'checking'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-900 p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold-400" />
            <p className="text-sm font-semibold text-slate-100">Prove it</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">{quest.title}</p>

        {phase === 'done' && verdict ? (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 ${
                verdict.verified
                  ? 'border-mystic-400/50 bg-mystic-500/10'
                  : 'border-ember-500/40 bg-ember-500/10'
              }`}
            >
              <div className="flex items-center gap-2">
                {verdict.verified ? (
                  <Check className="h-4 w-4 text-mystic-300" strokeWidth={3} />
                ) : (
                  <AlertCircle className="h-4 w-4 text-ember-400" />
                )}
                <p
                  className={`text-sm font-semibold ${
                    verdict.verified ? 'text-mystic-300' : 'text-ember-400'
                  }`}
                >
                  {verdict.verified ? 'Verified' : 'Not accepted'}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{verdict.reason}</p>
              {verdict.verified && (
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-gold-400">
                  <Zap className="h-3 w-3" />+{VERIFY_BONUS_XP[verdictKind]} bonus XP
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {!verdict.verified && (
                <button
                  type="button"
                  onClick={() => {
                    setVerdict(null)
                    setPreview(null)
                    setTranscript('')
                    setPhase('idle')
                    setMode('choose')
                  }}
                  className="flex-1 rounded-xl border border-ink-600 py-2.5 text-sm text-slate-200 transition-colors hover:bg-ink-800"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mode === 'choose' && (
              <>
                <p className="text-xs text-slate-500">
                  Back this up with proof and earn bonus XP. A photo counts for more than a spoken
                  confirmation.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('photo')
                    fileRef.current?.click()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/60 px-4 py-3 text-left transition-colors hover:border-ink-500"
                >
                  <Camera className="h-5 w-5 text-gold-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-100">Upload a photo</p>
                    <p className="text-[11px] text-slate-500">+{VERIFY_BONUS_XP.photo} bonus XP</p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!speechSupported}
                  onClick={() => {
                    setMode('voice')
                    startListening()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/60 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:border-ink-500"
                >
                  <Mic className="h-5 w-5 text-mystic-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-100">Say it out loud</p>
                    <p className="text-[11px] text-slate-500">
                      {speechSupported
                        ? `+${VERIFY_BONUS_XP.voice} bonus XP`
                        : 'Not supported in this browser'}
                    </p>
                  </div>
                </button>
              </>
            )}

            {mode === 'photo' && (
              <div className="space-y-3">
                {preview && (
                  <img
                    src={preview}
                    alt="Your evidence"
                    className="max-h-56 w-full rounded-xl border border-ink-600 object-contain"
                  />
                )}
                {!busy && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-xl border border-ink-600 py-2.5 text-sm text-slate-200 transition-colors hover:bg-ink-800"
                  >
                    {preview ? 'Choose a different photo' : 'Choose a photo'}
                  </button>
                )}
              </div>
            )}

            {mode === 'voice' && (
              <div className="space-y-3 text-center">
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${
                    phase === 'listening'
                      ? 'animate-pulse border-mystic-400 bg-mystic-500/20'
                      : 'border-ink-600 bg-ink-800'
                  }`}
                >
                  <Mic className="h-6 w-6 text-mystic-300" />
                </div>
                <p className="text-xs text-slate-400">
                  {phase === 'listening' ? 'Listening… describe what you did.' : 'Processing…'}
                </p>
                {transcript && <p className="text-sm italic text-slate-200">“{transcript}”</p>}
                {phase === 'listening' && (
                  <button
                    type="button"
                    onClick={stopListening}
                    className="w-full rounded-xl border border-ink-600 py-2.5 text-sm text-slate-200 transition-colors hover:bg-ink-800"
                  >
                    I'm done talking
                  </button>
                )}
              </div>
            )}

            {busy && (
              <p className="flex items-center justify-center gap-2 py-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your evidence…
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
                {error}
              </p>
            )}
          </div>
        )}

        {/* No `capture` attribute on purpose: it would force the camera open and
            skip the gallery. Without it, phones offer both — photo library or
            take a new one — which is what most people want. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleFile(file)
          }}
        />
      </motion.div>
    </motion.div>
  )
}

export function VerifyModalHost({
  quest,
  onClose,
  onVerified,
}: {
  quest: Quest | null
  onClose: () => void
  onVerified: (kind: VerificationKind, note: string) => void
}) {
  return (
    <AnimatePresence>
      {quest && <VerifyModal quest={quest} onClose={onClose} onVerified={onVerified} />}
    </AnimatePresence>
  )
}
