// Placeholder — replaced by Task F3 (소스/그래프/채팅 3컬럼 통합).
import { useParams } from 'react-router-dom'

function Workspace() {
  const { projectId } = useParams()
  return <div>Workspace {projectId}</div>
}

export default Workspace
