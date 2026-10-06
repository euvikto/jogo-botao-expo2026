export interface Team {
  id: string;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  text: string;
  strength: number;
  crest: string;
  confederation: "AFC" | "CAF" | "Concacaf" | "CONMEBOL" | "OFC" | "UEFA";
}

const team = (id: string, name: string, short: string, primary: string, secondary: string, text: string, strength: number, confederation: Team["confederation"]): Team => ({
  id, name, short, primary, secondary, text, strength, confederation, crest: `/crests/${id}.svg`,
});

// As 48 seleções participantes da Copa do Mundo de 2026.
export const TEAMS: Team[] = [
  team("can", "Canadá", "CAN", "#d80621", "#ffffff", "#ffffff", 75, "Concacaf"),
  team("mex", "México", "MEX", "#006847", "#ce1126", "#ffffff", 79, "Concacaf"),
  team("usa", "Estados Unidos", "EUA", "#1a2b57", "#b31942", "#ffffff", 80, "Concacaf"),
  team("crc", "Curaçao", "CUW", "#002b7f", "#f9e300", "#ffffff", 66, "Concacaf"),
  team("hai", "Haiti", "HAI", "#00209f", "#d21034", "#ffffff", 65, "Concacaf"),
  team("pan", "Panamá", "PAN", "#d21034", "#005293", "#ffffff", 70, "Concacaf"),
  team("arg", "Argentina", "ARG", "#75aadb", "#ffffff", "#172b4d", 92, "CONMEBOL"),
  team("bra", "Brasil", "BRA", "#009c3b", "#ffdf00", "#ffffff", 91, "CONMEBOL"),
  team("col", "Colômbia", "COL", "#fcd116", "#003893", "#111111", 84, "CONMEBOL"),
  team("ecu", "Equador", "EQU", "#ffdd00", "#034ea2", "#111111", 80, "CONMEBOL"),
  team("par", "Paraguai", "PAR", "#d52b1e", "#ffffff", "#ffffff", 76, "CONMEBOL"),
  team("uru", "Uruguai", "URU", "#5bc0eb", "#ffffff", "#102a43", 85, "CONMEBOL"),
  team("aus", "Austrália", "AUS", "#ffcd00", "#00843d", "#172b1d", 79, "AFC"),
  team("irn", "Irã", "IRÃ", "#239f40", "#da0000", "#ffffff", 78, "AFC"),
  team("irq", "Iraque", "IRQ", "#ce1126", "#ffffff", "#ffffff", 70, "AFC"),
  team("jpn", "Japão", "JAP", "#001e62", "#e60012", "#ffffff", 84, "AFC"),
  team("jor", "Jordânia", "JOR", "#007a3d", "#ce1126", "#ffffff", 69, "AFC"),
  team("kor", "Coreia do Sul", "COR", "#e6002d", "#0047a0", "#ffffff", 82, "AFC"),
  team("qat", "Catar", "CAT", "#8a1538", "#ffffff", "#ffffff", 72, "AFC"),
  team("ksa", "Arábia Saudita", "SAU", "#006c35", "#ffffff", "#ffffff", 75, "AFC"),
  team("uzb", "Uzbequistão", "UZB", "#1eb53a", "#0099b5", "#ffffff", 72, "AFC"),
  team("alg", "Argélia", "ALG", "#006233", "#ffffff", "#ffffff", 79, "CAF"),
  team("cpv", "Cabo Verde", "CPV", "#003893", "#f7d116", "#ffffff", 68, "CAF"),
  team("civ", "Costa do Marfim", "CIV", "#f77f00", "#009e60", "#ffffff", 81, "CAF"),
  team("cod", "RD Congo", "RDC", "#007fff", "#ce1021", "#ffffff", 72, "CAF"),
  team("egy", "Egito", "EGI", "#ce1126", "#000000", "#ffffff", 78, "CAF"),
  team("gha", "Gana", "GAN", "#ce1126", "#fcd116", "#ffffff", 76, "CAF"),
  team("mar", "Marrocos", "MAR", "#c1272d", "#006233", "#ffffff", 86, "CAF"),
  team("sen", "Senegal", "SEN", "#00853f", "#fdef42", "#ffffff", 82, "CAF"),
  team("rsa", "África do Sul", "AFS", "#007749", "#ffb81c", "#ffffff", 72, "CAF"),
  team("tun", "Tunísia", "TUN", "#e70013", "#ffffff", "#ffffff", 75, "CAF"),
  team("nzl", "Nova Zelândia", "NZL", "#101820", "#ffffff", "#ffffff", 68, "OFC"),
  team("aut", "Áustria", "AUT", "#ed2939", "#ffffff", "#ffffff", 82, "UEFA"),
  team("bel", "Bélgica", "BEL", "#000000", "#ef3340", "#fdda24", 86, "UEFA"),
  team("bih", "Bósnia e Herzegovina", "BIH", "#002395", "#fecb00", "#ffffff", 75, "UEFA"),
  team("cro", "Croácia", "CRO", "#ff0000", "#ffffff", "#ffffff", 87, "UEFA"),
  team("cze", "Tchéquia", "TCH", "#11457e", "#d7141a", "#ffffff", 79, "UEFA"),
  team("eng", "Inglaterra", "ING", "#ffffff", "#ce1124", "#132257", 90, "UEFA"),
  team("fra", "França", "FRA", "#002654", "#ed2939", "#ffffff", 92, "UEFA"),
  team("ger", "Alemanha", "ALE", "#1a1a1a", "#dd0000", "#ffffff", 89, "UEFA"),
  team("ned", "Países Baixos", "HOL", "#f36c21", "#ffffff", "#111111", 88, "UEFA"),
  team("nor", "Noruega", "NOR", "#ba0c2f", "#00205b", "#ffffff", 84, "UEFA"),
  team("por", "Portugal", "POR", "#046a38", "#da291c", "#ffffff", 90, "UEFA"),
  team("sco", "Escócia", "ESC", "#005eb8", "#ffffff", "#ffffff", 78, "UEFA"),
  team("esp", "Espanha", "ESP", "#aa151b", "#f1bf00", "#ffffff", 93, "UEFA"),
  team("swe", "Suécia", "SUE", "#006aa7", "#fecc02", "#ffffff", 81, "UEFA"),
  team("sui", "Suíça", "SUI", "#d52b1e", "#ffffff", "#ffffff", 84, "UEFA"),
  team("tur", "Turquia", "TUR", "#e30a17", "#ffffff", "#ffffff", 82, "UEFA"),
];

export function getTeam(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}
