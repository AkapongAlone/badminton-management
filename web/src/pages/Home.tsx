import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, loadAdmin, saveAdmin } from '../api'
import ConfigForm from '../components/ConfigForm'
import Logo from '../components/Logo'
import type { Config } from '../types'

const DEFAULT_CONFIG: Config = {
  billingMode: 'per_shuttle',
  courtFee: 60,
  shuttlePrice: 20,
  buffetPrice: 100,
  waitAlertMinutes: 20,
}

export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Returning organizer: jump straight to the admin page.
  useEffect(() => {
    const saved = loadAdmin()
    if (saved) navigate(`/g/${saved.groupId}/admin`, { replace: true })
  }, [navigate])

  const create = async (config: Config) => {
    if (!name.trim()) {
      setError('กรุณาตั้งชื่อก๊วน')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.createGroup(name.trim(), config)
      saveAdmin(res.groupId, res.adminToken)
      navigate(`/g/${res.groupId}/admin`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <Logo size="lg" className="mb-3" />
          <h1 className="text-2xl font-bold">สร้างก๊วนแบด</h1>
          <p className="text-gray-500 text-sm mt-1">ตั้งค่าเริ่มต้นครั้งเดียว ใช้เปิดก๊วนได้ทุกวัน</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">ชื่อก๊วน</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ก๊วนแบดบ้านสวน"
            />
          </label>
          <ConfigForm initial={DEFAULT_CONFIG} submitLabel="สร้างก๊วน" onSubmit={(cfg) => create(cfg)} busy={busy} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
