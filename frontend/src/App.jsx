import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./state/AppState";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import FindPage from "./pages/FindPage";
import WatchdogPage from "./pages/WatchdogPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="find" element={<FindPage />} />
            <Route path="watchdog" element={<WatchdogPage />} />
            <Route path="how-it-works" element={<HowItWorksPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  );
}
