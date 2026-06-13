import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Admin from './pages/Admin'
import Board from './pages/Board'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/g/:groupId/admin" element={<Admin />} />
        <Route path="/s/:sessionId" element={<Board />} />
      </Routes>
    </BrowserRouter>
  )
}
