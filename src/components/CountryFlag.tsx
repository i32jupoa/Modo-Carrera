import { useState } from "react";

/**
 * Get the URL for a country flag SVG
 * @param countryName - The country name (e.g., "España", "Inglaterra", "Arabia Saudí")
 * @returns The path to the flag SVG (e.g., "/flags/españa.svg")
 */
export function getFlagUrl(countryName: string): string {
  const formattedName = countryName.toLowerCase().trim();
  return `/flags/${formattedName}.svg`;
}

interface CountryFlagProps {
  country: string;
  className?: string;
  size?: "sm" | "md";
}

export function CountryFlag({ country, className = "", size = "sm" }: CountryFlagProps) {
  const [error, setError] = useState(false);

  const sizeClasses = size === "sm" ? "w-5 h-4" : "w-6 h-4";

  if (error) {
    return null; // Hide image if flag is missing
  }

  return (
    <img
      src={getFlagUrl(country)}
      alt={country}
      className={`${sizeClasses} object-cover rounded-sm ${className}`}
      onError={() => setError(true)}
    />
  );
}
