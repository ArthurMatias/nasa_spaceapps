import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null; // Só renderiza se estiver aberto

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative z-50 h-full w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-out translate-x-0">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          {title && <h2 className="text-xl font-semibold text-gray-900">{title}</h2>}
          <button
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// Exemplo de uso
const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg font-medium"
      >
        Abrir Modal
      </button>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Exemplo de Modal"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Este é um modal completamente funcional criado em React com TypeScript!
          </p>
          <p className="text-gray-600">
            Você pode adicionar qualquer conteúdo aqui. O modal fecha ao clicar no overlay, 
            no botão X ou nos botões de ação.
          </p>
          
          <div className="flex gap-3 justify-end pt-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                alert('Ação confirmada!');
                setIsModalOpen(false);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default App;