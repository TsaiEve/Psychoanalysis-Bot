
import React from 'react';
import ChatInterface from './components/ChatInterface.tsx';

const App: React.FC = () => {
  return (
    <div className="bg-gradient-to-br from-orange-50 via-rose-100 to-indigo-100 min-h-screen flex items-center justify-center p-4">
      <ChatInterface />
    </div>
  );
};

export default App;
