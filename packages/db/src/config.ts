import "dotenv/config";

export const getDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it in your .env file.");
  }

  return databaseUrl;
};
