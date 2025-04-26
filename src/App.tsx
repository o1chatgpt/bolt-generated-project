import { FileExplorer } from '@/components/FileExplorer';

function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <FileExplorer />
    </div>
  );
}

export default App;
