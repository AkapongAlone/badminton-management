import { useState } from 'react'
import type { Config } from '../types'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      min={0}
      className={inputCls}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
    />
  )
}

export default function ConfigForm({
  initial,
  withCourts,
  submitLabel,
  onSubmit,
  busy,
}: {
  initial: Config
  withCourts?: { initial: number } // show court-count field (session creation)
  submitLabel: string
  onSubmit: (config: Config, courts: number) => void
  busy?: boolean
}) {
  const [cfg, setCfg] = useState<Config>({ ...initial })
  const [courts, setCourts] = useState(withCourts?.initial ?? 2)
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...cfg, waitAlertMinutes: cfg.waitAlertMinutes || 20 }, courts)
      }}
    >
      <Field label="รูปแบบคิดเงิน">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['buffet', 'บุฟเฟ่ (เหมาจ่าย)'],
              ['per_shuttle', 'นับลูก'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => set('billingMode', mode)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                cfg.billingMode === mode
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {cfg.billingMode === 'buffet' ? (
        <Field label="ราคาบุฟเฟ่ (บาท/คน)">
          <NumInput value={cfg.buffetPrice} onChange={(v) => set('buffetPrice', v ?? 0)} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="ค่าคอร์ท (บาท/คน)">
            <NumInput value={cfg.courtFee} onChange={(v) => set('courtFee', v ?? 0)} />
          </Field>
          <Field label="ค่าลูก (บาท/ลูก)">
            <NumInput value={cfg.shuttlePrice} onChange={(v) => set('shuttlePrice', v ?? 0)} />
          </Field>
        </div>
      )}

      {withCourts && (
        <Field label="จำนวนคอร์ท">
          <NumInput value={courts} onChange={(v) => setCourts(Math.min(20, Math.max(1, v ?? 1)))} />
        </Field>
      )}

      <Field label="แจ้งเตือนเมื่อรอนานเกิน (นาที)">
        <NumInput value={cfg.waitAlertMinutes} onChange={(v) => set('waitAlertMinutes', v ?? 20)} />
      </Field>

      <details className="rounded-lg border border-gray-200 p-3" open={cfg.courtCostTotal != null || cfg.shuttleCost != null}>
        <summary className="cursor-pointer text-sm font-medium text-gray-600">
          ต้นทุน (ไม่บังคับ — ใช้คำนวณกำไร เห็นเฉพาะแอดมิน)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="ค่าเช่าคอร์ทรวม (บาท)">
            <NumInput value={cfg.courtCostTotal ?? null} onChange={(v) => set('courtCostTotal', v)} placeholder="-" />
          </Field>
          <Field label="ต้นทุนลูก (บาท/ลูก)">
            <NumInput value={cfg.shuttleCost ?? null} onChange={(v) => set('shuttleCost', v)} placeholder="-" />
          </Field>
        </div>
      </details>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'กำลังบันทึก…' : submitLabel}
      </button>
    </form>
  )
}
