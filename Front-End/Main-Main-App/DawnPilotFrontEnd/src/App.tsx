
import { useState } from 'react'
import './App.css'
import BuilderPage from './pages/BuilderPage/BuilderPage'
import HomePage from './pages/HomePage/HomePage'

function App() {
  const [page, setPage] = useState("")
  return (
    page === "Researcher" ?
   <BuilderPage/>:
    <HomePage onClick={setPage}/>
  )
}

export default App
