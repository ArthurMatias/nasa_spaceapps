import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, err?: any}> {
  constructor(props:any){ super(props); this.state={hasError:false}; }
  static getDerivedStateFromError(_:any){ return {hasError:true}; }
  componentDidCatch(err:any, info:any){ console.error("ErrorBoundary", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:16}}>
          <h2>Algo deu errado no frontend</h2>
          <p>Abra o console do navegador para detalhes.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
