import React from "react";
import "./header.css";

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title = "Orbitantes" }) => {
  return (
    <header style={styles.header}>
      <img src="./src/assets/logo.png" alt="logo" width={80}/>
      <h1 style={styles.title}>{title}</h1>
    </header>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    backgroundColor: "#2a3647",
    color: "#ffffff",
    padding: "1rem 2rem",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: "1.8rem",
  },
};

export default Header;
