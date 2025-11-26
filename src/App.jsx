import RaceSimulator from './components/RaceSimulator'
import FIAControlPanel from './components/FIAControlPanel'
import { RaceControlProvider } from './context/RaceControlContext'
import './App.css'

function App() {
  return (
    <RaceControlProvider>
      <div className="App">
        <RaceSimulator />
        <FIAControlPanel />
      </div>
    </RaceControlProvider>
  )
}

export default App
