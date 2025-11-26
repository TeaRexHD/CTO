import RaceSimulator from './components/RaceSimulator'
import { RaceDirectorProvider } from './context/RaceDirectorContext'
import './App.css'

function App() {
  return (
    <RaceDirectorProvider>
      <div className="App">
        <RaceSimulator />
      </div>
    </RaceDirectorProvider>
  )
}

export default App
