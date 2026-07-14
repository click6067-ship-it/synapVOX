import { Route, Routes } from 'react-router-dom'
import Drawer from './nav/Drawer'
import Home from './home/Home'
import Workspace from './workspace/Workspace'
import { GraphView } from './graph/GraphView'
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
          {/* Temporary dev route (Task 6): verify graph elasticity against the
              live backend. Full App wiring happens in Task 14. */}
          <Route
            path="/dev/graph"
            element={
              <div style={{ position: 'fixed', inset: 0 }}>
                <GraphView project="P-BIO" />
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default App
