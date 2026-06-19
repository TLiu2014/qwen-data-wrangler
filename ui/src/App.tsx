import { BrowserRouter, Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import Workspace from "@/pages/Workspace";
import DocsPage from "@/pages/DocsPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<Workspace />} />
        <Route path="/docs" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
