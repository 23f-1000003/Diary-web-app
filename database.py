import sqlite3
import os

def create_database():
    """Initialize the SQLite database with required tables"""
    
    # Create database file if it doesn't exist
    db_path = 'diary.db'
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute('PRAGMA foreign_keys = ON')
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Diary entries table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS diary_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            entry_date DATE NOT NULL,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Images table for diary entries - UPDATED with tilt fields
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS diary_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            entry_date DATE NOT NULL,
            filename TEXT NOT NULL,
            caption TEXT,
            position_x INTEGER DEFAULT 0,
            position_y INTEGER DEFAULT 0,
            rotation REAL DEFAULT 0,
            scale REAL DEFAULT 1.0,
            tilt_x REAL DEFAULT 0,
            tilt_y REAL DEFAULT 0,
            z_index INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Add tilt columns to existing table if they don't exist
    try:
        cursor.execute('ALTER TABLE diary_images ADD COLUMN tilt_x REAL DEFAULT 0')
        cursor.execute('ALTER TABLE diary_images ADD COLUMN tilt_y REAL DEFAULT 0')
        print("Added tilt columns to existing table")
    except sqlite3.OperationalError:
        # Columns already exist
        pass
    
    # Create indexes for better performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, entry_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_diary_images_user_date ON diary_images(user_id, entry_date)')
    
    conn.commit()
    conn.close()
    
    print("Database created successfully with tilt support!")

if __name__ == '__main__':
    create_database()