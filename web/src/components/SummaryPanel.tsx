import { fmtBaht } from '../hooks'
import type { Config, Summary } from '../types'

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

// Organizer-only: never rendered on the public board (the server doesn't even
// send `summary` without the admin token).
export default function SummaryPanel({ summary, config }: { summary: Summary; config: Config }) {
  const buffet = config.billingMode === 'buffet'
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
      <h2 className="font-semibold text-gray-700">สรุป (เฉพาะแอดมิน)</h2>
      <div className="space-y-1">
        <Row label="ผู้เล่น" value={`${summary.playerCount} คน`} />
        <Row label="เกมทั้งหมด" value={`${summary.totalGames} เกม`} />
        <Row label="ลูกที่เปิดใช้" value={`${summary.totalShuttles} ลูก`} />
      </div>
      <hr className="border-gray-100" />
      <div className="space-y-1">
        {buffet ? (
          <Row label="ค่าบุฟเฟ่" value={fmtBaht(summary.revenueCourt)} />
        ) : (
          <>
            <Row label="รายรับค่าคอร์ท" value={fmtBaht(summary.revenueCourt)} />
            <Row label="รายรับค่าลูก" value={fmtBaht(summary.revenueShuttle)} />
          </>
        )}
        <Row label="รายรับรวม" value={fmtBaht(summary.revenueTotal)} bold />
      </div>
      {summary.profit !== undefined && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-1">
            {summary.courtCost !== undefined && summary.courtCost > 0 && (
              <Row label="ต้นทุนค่าคอร์ท" value={`-${fmtBaht(summary.courtCost)}`} />
            )}
            {summary.shuttleCostTotal !== undefined && summary.shuttleCostTotal > 0 && (
              <Row label={`ต้นทุนลูก (${summary.totalShuttles} ลูก)`} value={`-${fmtBaht(summary.shuttleCostTotal)}`} />
            )}
            <div className={`flex justify-between font-bold ${summary.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              <span>กำไร</span>
              <span className="tabular-nums">{fmtBaht(summary.profit)}</span>
            </div>
          </div>
        </>
      )}
      <hr className="border-gray-100" />
      <div>
        <div className="text-sm font-medium text-gray-700 mb-1">ค้างจ่าย ({summary.unpaid.length})</div>
        {summary.unpaid.length === 0 ? (
          <p className="text-xs text-emerald-600">จ่ายครบทุกคนแล้ว 🎉</p>
        ) : (
          <ul className="space-y-0.5">
            {summary.unpaid.map((u) => (
              <li key={u.id} className="flex justify-between text-xs text-red-600">
                <span>{u.name}</span>
                <span className="tabular-nums">{fmtBaht(u.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
