from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import sqlite3
import os
from datetime import datetime
import base64

app = Flask(__name__)
app.secret_key = 'Askme@4002'
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def init_db():
    conn = sqlite3.connect('diary.db')
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
    
    # Add tilt columns if they don't exist
    try:
        cursor.execute('ALTER TABLE diary_images ADD COLUMN tilt_x REAL DEFAULT 0')
        cursor.execute('ALTER TABLE diary_images ADD COLUMN tilt_y REAL DEFAULT 0')
    except sqlite3.OperationalError:
        pass
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('diary'))
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    try:
        password_hash = generate_password_hash(password)
        cursor.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                      (username, email, password_hash))
        conn.commit()
        return jsonify({'success': True, 'message': 'User registered successfully'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username or email already exists'}), 400
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, password_hash FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and check_password_hash(user[1], password):
        session['user_id'] = user[0]
        session['username'] = username
        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/diary')
def diary():
    if 'user_id' not in session:
        return redirect(url_for('index'))
    return render_template('diary.html', username=session['username'])

@app.route('/api/diary/<date>')
def get_diary_entry(date):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    # Get diary entry
    cursor.execute('SELECT content FROM diary_entries WHERE user_id = ? AND entry_date = ?',
                  (session['user_id'], date))
    entry = cursor.fetchone()
    
    # Get images with tilt support
    cursor.execute('''SELECT filename, caption, position_x, position_y, rotation, scale, 
                     COALESCE(tilt_x, 0) as tilt_x, COALESCE(tilt_y, 0) as tilt_y, z_index
                     FROM diary_images WHERE user_id = ? AND entry_date = ?
                     ORDER BY z_index''',
                  (session['user_id'], date))
    images = cursor.fetchall()
    
    conn.close()
    
    return jsonify({
        'content': entry[0] if entry else '',
        'images': [{
            'filename': img[0],
            'caption': img[1],
            'position_x': img[2],
            'position_y': img[3],
            'rotation': img[4],
            'scale': img[5],
            'tilt_x': img[6],
            'tilt_y': img[7],
            'z_index': img[8]
        } for img in images]
    })

@app.route('/api/diary/<date>', methods=['POST'])
def save_diary_entry(date):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    content = data.get('content', '')
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    # Use INSERT OR REPLACE to ensure data is properly saved
    cursor.execute('''INSERT OR REPLACE INTO diary_entries 
                     (user_id, entry_date, content, updated_at) 
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)''',
                  (session['user_id'], date, content))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/upload_image', methods=['POST'])
def upload_image():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image file'}), 400
    
    file = request.files['image']
    date = request.form.get('date')
    caption = request.form.get('caption', '')
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file:
        filename = secure_filename(f"{session['user_id']}_{date}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        
        conn = sqlite3.connect('diary.db')
        cursor = conn.cursor()
        
        cursor.execute('''INSERT INTO diary_images 
                         (user_id, entry_date, filename, caption, tilt_x, tilt_y) 
                         VALUES (?, ?, ?, ?, 0, 0)''',
                      (session['user_id'], date, filename, caption))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'filename': filename})

@app.route('/api/update_image', methods=['POST'])
def update_image():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    filename = data.get('filename')
    position_x = data.get('position_x')
    position_y = data.get('position_y')
    rotation = data.get('rotation')
    scale = data.get('scale')
    tilt_x = data.get('tilt_x', 0)
    tilt_y = data.get('tilt_y', 0)
    caption = data.get('caption')
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    cursor.execute('''UPDATE diary_images 
                     SET position_x = ?, position_y = ?, rotation = ?, scale = ?, 
                         tilt_x = ?, tilt_y = ?, caption = ?
                     WHERE user_id = ? AND filename = ?''',
                  (position_x, position_y, rotation, scale, tilt_x, tilt_y, caption, 
                   session['user_id'], filename))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/delete_image', methods=['POST'])
def delete_image():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    filename = data.get('filename')
    
    if not filename:
        return jsonify({'error': 'Filename required'}), 400
    
    conn = sqlite3.connect('diary.db')
    cursor = conn.cursor()
    
    # Delete from database
    cursor.execute('DELETE FROM diary_images WHERE user_id = ? AND filename = ?',
                  (session['user_id'], filename))
    
    # Delete physical file
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass  # File might be in use or already deleted
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)