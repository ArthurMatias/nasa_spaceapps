import React, { useState, useEffect, useRef } from "react";
import { usStates } from "./EUAstates"; // Certifique-se que este arquivo existe
import './StateSearch.css'; // Vamos criar este arquivo para os estilos

type Props = {
  onSelect: (state: { name: string; lat: number; lon: number }) => void;
};

export default function StateSearch({ onSelect }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [filteredStates, setFilteredStates] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Filtra os estados conforme o usuário digita
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setInputValue(query);

    if (query.length > 0) {
      const filtered = usStates.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredStates(filtered);
      setIsOpen(true);
    } else {
      setFilteredStates([]);
      setIsOpen(false);
    }
  };

  // Chamado quando um estado é selecionado na lista
  const handleSelectState = (state: { name: string; lat: number; lon: number }) => {
    setInputValue(state.name); // Preenche o input com o nome do estado
    setIsOpen(false);         // Fecha a lista de sugestões
    onSelect(state);          // Envia o estado completo para o componente pai
  };

  // Efeito para fechar a lista de sugestões ao clicar fora do componente
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="search-container" ref={searchContainerRef} style={{width: '100%'}}>
      <div className="input-wrapper">
        {/* Ícone de lupa para um visual mais moderno */}
        <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue && filteredStates.length > 0 && setIsOpen(true)}
          placeholder="Search a state..."
          className="search-input"
        />
      </div>

      {isOpen && filteredStates.length > 0 && (
        <ul className="suggestions-list">
          {filteredStates.map((state) => (
            <li
              key={state.name}
              className="suggestion-item"
              onClick={() => handleSelectState(state)}
            >
              {state.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}