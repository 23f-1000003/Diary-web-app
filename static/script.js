// Global variables
let currentDate = new Date();
let selectedImage = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let pendingImageFile = null;

// Initialize the diary
document.addEventListener('DOMContentLoaded', function() {
    updateDateDisplay();
    loadDiaryEntry();
    setupEventListeners();
    createNotificationElement();
});

function createNotificationElement() {
    // Create notification element if it doesn't exist
    if (!document.getElementById('notification')) {
        const notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 1002;
            display: none;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        `;
        document.body.appendChild(notification);
    }
}

// Date management
function updateDateDisplay() {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = 
        currentDate.toLocaleDateString('en-US', options);
}

function changeDate(days) {
    saveDiary(); // Save current entry before changing
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    loadDiaryEntry();
}

function goToToday() {
    saveDiary(); // Save current entry before changing
    currentDate = new Date();
    updateDateDisplay();
    loadDiaryEntry();
}

function getDateString() {
    return currentDate.toISOString().split('T')[0];
}

// Diary entry management
async function loadDiaryEntry() {
    try {
        const response = await fetch(`/api/diary/${getDateString()}`);
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('diaryText').value = data.content || '';
            loadImages(data.images || []);
        } else {
            // Entry doesn't exist yet, that's fine
            document.getElementById('diaryText').value = '';
            document.getElementById('imagesContainer').innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading diary entry:', error);
        showNotification('Connection error while loading entry', 'error');
        document.getElementById('diaryText').value = '';
        document.getElementById('imagesContainer').innerHTML = '';
    }
}

async function saveDiary() {
    const content = document.getElementById('diaryText').value;
    
    try {
        const response = await fetch(`/api/diary/${getDateString()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            showNotification('Diary entry saved successfully!', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to save diary entry', 'error');
        }
    } catch (error) {
        console.error('Error saving diary entry:', error);
        showNotification('Connection error while saving', 'error');
    }
}

// Image management with tilt support
function loadImages(images) {
    const container = document.getElementById('imagesContainer');
    container.innerHTML = '';
    
    images.forEach(imageData => {
        createImageElement(imageData);
    });
}

function createImageElement(imageData) {
    const container = document.getElementById('imagesContainer');
    const imageDiv = document.createElement('div');
    imageDiv.className = 'diary-image';
    imageDiv.style.left = imageData.position_x + 'px';
    imageDiv.style.top = imageData.position_y + 'px';
    imageDiv.style.zIndex = imageData.z_index || 1;
    
    // Store transformation data in dataset
    imageDiv.dataset.filename = imageData.filename;
    imageDiv.dataset.rotation = imageData.rotation || 0;
    imageDiv.dataset.scale = imageData.scale || 1;
    imageDiv.dataset.tiltX = imageData.tilt_x || 0;
    imageDiv.dataset.tiltY = imageData.tilt_y || 0;
    
    // Create caption FIRST (will appear at top due to CSS flexbox order)
    if (imageData.caption) {
        const caption = document.createElement('div');
        caption.className = 'image-caption';
        caption.textContent = imageData.caption;
        imageDiv.appendChild(caption);
    }
    
    // Create image element
    const img = document.createElement('img');
    img.src = `/static/uploads/${imageData.filename}`;
    img.alt = imageData.caption || 'Diary image';
    imageDiv.appendChild(img);
    
    // Apply transforms
    updateImageTransformFromData(imageDiv);
    
    // Setup interactions
    setupImageInteraction(imageDiv);
    
    container.appendChild(imageDiv);
}

function updateImageTransformFromData(imageDiv) {
    const rotation = parseFloat(imageDiv.dataset.rotation) || 0;
    const scale = parseFloat(imageDiv.dataset.scale) || 1;
    const tiltX = parseFloat(imageDiv.dataset.tiltX) || 0;
    const tiltY = parseFloat(imageDiv.dataset.tiltY) || 0;
    
    const transform = `rotate(${rotation}deg) scale(${scale}) skew(${tiltX}deg, ${tiltY}deg)`;
    imageDiv.style.transform = transform;
}

function setupImageInteraction(imageDiv) {
    // Click to select
    imageDiv.addEventListener('click', function(e) {
        e.stopPropagation();
        selectImage(imageDiv);
    });
    
    // Right-click for controls
    imageDiv.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        selectImage(imageDiv);
        showImageControls(e.pageX, e.pageY);
    });
    
    // Drag functionality
    imageDiv.addEventListener('mousedown', startDragging);
}

function selectImage(imageDiv) {
    // Deselect all first
    document.querySelectorAll('.diary-image').forEach(img => {
        img.classList.remove('selected');
    });
    
    selectedImage = imageDiv;
    imageDiv.classList.add('selected');
}

function showImageControls(x, y) {
    const controls = document.getElementById('imageControls');
    if (controls) {
        controls.style.display = 'block';
        controls.style.left = Math.min(x, window.innerWidth - 250) + 'px';
        controls.style.top = Math.min(y, window.innerHeight - 400) + 'px';
    }
}

function hideImageControls() {
    const controls = document.getElementById('imageControls');
    if (controls) {
        controls.style.display = 'none';
    }
}

// Drag functionality
function startDragging(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    isDragging = true;
    selectedImage = e.currentTarget;
    selectImage(selectedImage);
    
    const rect = selectedImage.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', stopDragging);
    
    e.preventDefault();
}

function handleDragging(e) {
    if (!isDragging || !selectedImage) return;
    
    const containerRect = document.getElementById('imagesContainer').getBoundingClientRect();
    
    let newX = e.clientX - containerRect.left - dragOffset.x;
    let newY = e.clientY - containerRect.top - dragOffset.y;
    
    // Keep within bounds
    newX = Math.max(0, Math.min(newX, containerRect.width - selectedImage.offsetWidth));
    newY = Math.max(0, Math.min(newY, containerRect.height - selectedImage.offsetHeight));
    
    selectedImage.style.left = newX + 'px';
    selectedImage.style.top = newY + 'px';
}

function stopDragging() {
    if (isDragging) {
        isDragging = false;
        updateImagePosition();
        
        document.removeEventListener('mousemove', handleDragging);
        document.removeEventListener('mouseup', stopDragging);
    }
}

// Image transformation functions
function rotateImage(degrees) {
    if (!selectedImage) return;
    
    const currentRotation = parseFloat(selectedImage.dataset.rotation) || 0;
    selectedImage.dataset.rotation = currentRotation + degrees;
    updateImageTransformFromData(selectedImage);
    updateImagePosition();
}

function tiltImage(tiltX, tiltY) {
    if (!selectedImage) return;
    
    const currentTiltX = parseFloat(selectedImage.dataset.tiltX) || 0;
    const currentTiltY = parseFloat(selectedImage.dataset.tiltY) || 0;
    
    selectedImage.dataset.tiltX = currentTiltX + tiltX;
    selectedImage.dataset.tiltY = currentTiltY + tiltY;
    
    updateImageTransformFromData(selectedImage);
    updateImagePosition();
}

function scaleImage(factor) {
    if (!selectedImage) return;
    
    const currentScale = parseFloat(selectedImage.dataset.scale) || 1;
    const newScale = Math.max(0.1, Math.min(3, currentScale * factor));
    selectedImage.dataset.scale = newScale;
    updateImageTransformFromData(selectedImage);
    updateImagePosition();
}

function resetTilt() {
    if (!selectedImage) return;
    
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransformFromData(selectedImage);
    updateImagePosition();
}

function resetTransforms() {
    if (!selectedImage) return;
    
    selectedImage.dataset.rotation = 0;
    selectedImage.dataset.scale = 1;
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransformFromData(selectedImage);
    updateImagePosition();
}

async function updateImagePosition() {
    if (!selectedImage) return;
    
    const filename = selectedImage.dataset.filename;
    const position_x = selectedImage.offsetLeft;
    const position_y = selectedImage.offsetTop;
    
    const captionElement = selectedImage.querySelector('.image-caption');
    const caption = captionElement ? captionElement.textContent : '';
    
    try {
        const response = await fetch('/api/update_image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename,
                position_x,
                position_y,
                rotation: parseFloat(selectedImage.dataset.rotation) || 0,
                scale: parseFloat(selectedImage.dataset.scale) || 1,
                tilt_x: parseFloat(selectedImage.dataset.tiltX) || 0,
                tilt_y: parseFloat(selectedImage.dataset.tiltY) || 0,
                caption
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            console.error('Error updating image position:', data.error);
        }
    } catch (error) {
        console.error('Error updating image position:', error);
    }
}

async function deleteImage() {
    if (!selectedImage) return;
    
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    const filename = selectedImage.dataset.filename;
    
    try {
        const response = await fetch('/api/delete_image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename: filename })
        });
        
        if (response.ok) {
            selectedImage.remove();
            selectedImage = null;
            hideImageControls();
            showNotification('Image deleted', 'success');
        } else {
            const data = await response.json();
            showNotification('Failed to delete: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Connection error while deleting', 'error');
    }
}

// Event listeners setup
function setupEventListeners() {
    // Image upload
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload) {
        imageUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                pendingImageFile = file;
                const modal = document.getElementById('captionModal');
                if (modal) {
                    modal.style.display = 'flex';
                    const input = document.getElementById('captionInput');
                    if (input) {
                        input.focus();
                    }
                }
            }
        });
    }
    
    // Auto-save diary content
    const diaryText = document.getElementById('diaryText');
    if (diaryText) {
        diaryText.addEventListener('input', debounce(saveDiary, 2000));
    }
    
    // Modal Enter key support
    const captionInput = document.getElementById('captionInput');
    if (captionInput) {
        captionInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                saveCaptionAndUpload();
            }
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 's':
                    e.preventDefault();
                    saveDiary();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    changeDate(-1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    changeDate(1);
                    break;
            }
        }
        
        if (selectedImage && e.key === 'Delete') {
            deleteImage();
        }
        
        if (e.key === 'Escape') {
            hideImageControls();
            closeCaptionModal();
        }
    });
    
    // Click outside to deselect
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.image-controls') && !e.target.closest('.diary-image')) {
            hideImageControls();
            // Deselect image
            document.querySelectorAll('.diary-image').forEach(img => {
                img.classList.remove('selected');
            });
            selectedImage = null;
        }
        
        if (!e.target.closest('.modal') && !e.target.closest('.add-image-btn')) {
            closeCaptionModal();
        }
    });
}

// Image upload functionality
async function saveCaptionAndUpload() {
    if (!pendingImageFile) {
        showNotification('No file selected', 'error');
        return;
    }
    
    const caption = document.getElementById('captionInput').value;
    const formData = new FormData();
    formData.append('image', pendingImageFile);
    formData.append('date', getDateString());
    formData.append('caption', caption);
    
    try {
        const response = await fetch('/api/upload_image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Image uploaded successfully!', 'success');
            
            // Create image element with default values
            const imageData = {
                filename: data.filename,
                caption: caption,
                position_x: 50,
                position_y: 50,
                rotation: 0,
                scale: 1.0,
                tilt_x: 0,
                tilt_y: 0,
                z_index: 1
            };
            
            createImageElement(imageData);
            closeCaptionModal();
        } else {
            showNotification(data.error || 'Failed to upload image', 'error');
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Connection error while uploading', 'error');
    }
    
    pendingImageFile = null;
    document.getElementById('imageUpload').value = '';
}

function closeCaptionModal() {
    const modal = document.getElementById('captionModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    const input = document.getElementById('captionInput');
    if (input) {
        input.value = '';
    }
    
    pendingImageFile = null;
    
    const upload = document.getElementById('imageUpload');
    if (upload) {
        upload.value = '';
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.log(`${type.toUpperCase()}: ${message}`);
        return;
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Set background color based on type
    if (type === 'success') {
        notification.style.background = 'linear-gradient(145deg, #28a745, #218838)';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(145deg, #dc3545, #c82333)';
    } else {
        notification.style.background = 'linear-gradient(145deg, #17a2b8, #138496)';
    }
    
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}