from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import sqlite3
import os
from datetime import datetime
import base64

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-this')
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def get_db_connection():
    conn = sqlite3.connect('diary.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
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
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Images table with tilt support
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
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save_entry', methods=['POST'])
def save_entry():
    try:
        data = request.json
        date = data.get('date')
        content = data.get('content', '')
        
        if not date:
            return jsonify({'success': False, 'error': 'Date is required'})
        
        conn = sqlite3.connect('diary.db')
        c = conn.cursor()
        
        # Use INSERT OR REPLACE to handle both new entries and updates
        c.execute("INSERT OR REPLACE INTO diary_entries (date, content) VALUES (?, ?)", (date, content))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/get_entry/<date>')
def get_entry(date):
    try:
        conn = sqlite3.connect('diary.db')
        c = conn.cursor()
        
        # Get diary content
        c.execute("SELECT content FROM diary_entries WHERE date = ?", (date,))
        result = c.fetchone()
        content = result[0] if result else ''
        
        # Get images for this date
        c.execute("SELECT id, filename, caption FROM images WHERE date = ?", (date,))
        images = []
        for row in c.fetchall():
            images.append({
                'id': row[0],
                'filename': row[1],
                'caption': row[2] or ''
            })
        
        conn.close()
        
        return jsonify({
            'success': True,
            'content': content,
            'images': images
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        date = request.form.get('date')
        caption = request.form.get('caption', '')
        
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file'})
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{timestamp}_{file.filename}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        file.save(filepath)
        
        # Save to database
        conn = sqlite3.connect('diary.db')
        c = conn.cursor()
        c.execute("INSERT INTO images (date, filename, caption) VALUES (?, ?, ?)", 
                 (date, filename, caption))
        image_id = c.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'image_id': image_id,
            'filename': filename,
            'caption': caption
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/delete_image', methods=['POST'])
def delete_image():
    try:
        data = request.json
        image_id = data.get('image_id')
        
        if not image_id:
            return jsonify({'success': False, 'error': 'Image ID required'})
        
        conn = sqlite3.connect('diary.db')
        c = conn.cursor()
        
        # Get filename before deleting from database
        c.execute("SELECT filename FROM images WHERE id = ?", (image_id,))
        result = c.fetchone()
        
        if result:
            filename = result[0]
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            
            # Delete from database first
            c.execute("DELETE FROM images WHERE id = ?", (image_id,))
            conn.commit()
            
            # Then delete physical file
            if os.path.exists(filepath):
                os.remove(filepath)
            
            conn.close()
            return jsonify({'success': True})
        else:
            conn.close()
            return jsonify({'success': False, 'error': 'Image not found'})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)