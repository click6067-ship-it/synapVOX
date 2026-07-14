import { Route, Routes } from 'react-router-dom'
import GraphPage from './pages/GraphPage'

// Both routes render the graph app. `/` resolves to the first project;
// `/p/:projectId` targets a specific one. GraphPage owns the full-screen shell.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GraphPage />} />
      <Route path="/p/:projectId" element={<GraphPage />} />
    </Routes>
  )
}
