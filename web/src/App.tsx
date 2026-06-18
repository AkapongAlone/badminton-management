import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Admin from './pages/Admin'
import Board from './pages/Board'
import Members from './pages/Members'
import Stats from './pages/Stats'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/g/:groupId/admin" element={<Admin />} />
        <Route path="/g/:groupId/stats" element={<Stats />} />
        <Route path="/s/:sessionId" element={<Board />} />
        <Route path="/s/:sessionId/members" element={<Members />} />
      </Routes>
    </BrowserRouter>
  )
}
