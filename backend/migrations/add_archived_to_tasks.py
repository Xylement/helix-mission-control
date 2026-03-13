"""Add archived column to tasks table."""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'tasks' AND column_name = 'archived'"
        ))
        if result.fetchone():
            print("Column 'archived' already exists on tasks table. Skipping.")
            return

        await conn.execute(text(
            "ALTER TABLE tasks ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        print("Added 'archived' column to tasks table.")


if __name__ == "__main__":
    asyncio.run(migrate())
