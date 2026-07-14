import { Route, Routes } from 'react-router-dom'
import Drawer from './nav/Drawer'
import Home from './home/Home'
import Workspace from './workspace/Workspace'
import './styles/tokens.css'
import './styles/app.css'

function App() {
  return (
    <div className="app-shell">
      <Drawer />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:projectId" element={<Workspace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
