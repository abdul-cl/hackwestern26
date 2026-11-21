import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./state/AppState";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";

// The home page loads first; the other pages (and the map library the search page needs) load when visited.
const FindPage = lazy(() => import("./pages/FindPage"));
const WatchdogPage = lazy(() => import("./pages/WatchdogPage"));
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const page = (Page) => (
  <Suspense fallback={<div className="min-h-[60vh]" />}>
    <Page />
  </Suspense>
);

export default function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="find" element={page(FindPage)} />
            <Route path="watchdog" element={page(WatchdogPage)} />
            <Route path="how-it-works" element={page(HowItWorksPage)} />
            <Route path="*" element={page(NotFoundPage)} />
          </Route>
        </Routes>
      </AppStateProvider>
    </BrowserRouter>
  );
}
