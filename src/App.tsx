import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import SummaryPage from './pages/SummaryPage'
import PipelinePage from './pages/PipelinePage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"         element={<SummaryPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/admin"    element={<AdminPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
