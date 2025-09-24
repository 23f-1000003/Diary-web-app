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
});

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
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    loadDiaryEntry();
}

function goToToday() {
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
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('diaryText').value = data.content || '';
            loadImages(data.images || []);
        } else {
            showNotification('Failed to load diary entry', 'error');
        }
    } catch (error) {
        console.error('Error loading diary entry:', error);
        showNotification('Connection error while loading entry', 'error');
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
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Diary entry saved successfully!', 'success');
        } else {
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
    
    // Store transformation data in dataset
    imageDiv.dataset.filename = imageData.filename;
    imageDiv.dataset.rotation = imageData.rotation || 0;
    imageDiv.dataset.scale = imageData.scale || 1;
    imageDiv.dataset.tiltX = imageData.tilt_x || 0;
    imageDiv.dataset.tiltY = imageData.tilt_y || 0;
    
    // Build transform with rotation, scale, and tilt
    updateImageTransformFromData(imageDiv);
    
    imageDiv.style.zIndex = imageData.z_index;
    
    imageDiv.innerHTML = `
        <img src="/static/uploads/${imageData.filename}" alt="Diary image">
        <div class="image-caption">${imageData.caption || ''}</div>
    `;
    
    setupImageInteraction(imageDiv);
    container.appendChild(imageDiv);
}

function updateImageTransformFromData(imageElement) {
    const rotation = parseFloat(imageElement.dataset.rotation) || 0;
    const scale = parseFloat(imageElement.dataset.scale) || 1;
    const tiltX = parseFloat(imageElement.dataset.tiltX) || 0;
    const tiltY = parseFloat(imageElement.dataset.tiltY) || 0;
    
    const transforms = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (scale !== 1) transforms.push(`scale(${scale})`);
    if (tiltX || tiltY) transforms.push(`skew(${tiltX}deg, ${tiltY}deg)`);
    
    imageElement.style.transform = transforms.join(' ');
}

function setupImageInteraction(imageElement) {
    imageElement.addEventListener('mousedown', function(e) {
        e.preventDefault();
        selectImage(imageElement);
        
        if (e.button === 0) { // Left click for dragging
            isDragging = true;
            const rect = imageElement.getBoundingClientRect();
            
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            document.addEventListener('mousemove', dragImage);
            document.addEventListener('mouseup', stopDragging);
        }
    });
    
    imageElement.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        selectImage(imageElement);
        showImageControls(e.clientX, e.clientY);
    });
    
    imageElement.addEventListener('dblclick', function(e) {
        e.preventDefault();
        selectImage(imageElement);
        showImageControls(e.clientX, e.clientY);
    });
}

function selectImage(imageElement) {
    // Remove selection from other images
    document.querySelectorAll('.diary-image').forEach(img => {
        img.classList.remove('selected');
    });
    
    // Select current image
    imageElement.classList.add('selected');
    selectedImage = imageElement;
}

function dragImage(e) {
    if (!isDragging || !selectedImage) return;
    
    e.preventDefault();
    const containerRect = document.getElementById('imagesContainer').getBoundingClientRect();
    
    let newX = e.clientX - containerRect.left - dragOffset.x;
    let newY = e.clientY - containerRect.top - dragOffset.y;
    
    // Keep image within container bounds
    newX = Math.max(0, Math.min(newX, containerRect.width - selectedImage.offsetWidth));
    newY = Math.max(0, Math.min(newY, containerRect.height - selectedImage.offsetHeight));
    
    selectedImage.style.left = newX + 'px';
    selectedImage.style.top = newY + 'px';
}

function stopDragging() {
    if (isDragging && selectedImage) {
        isDragging = false;
        updateImagePosition();
        document.removeEventListener('mousemove', dragImage);
        document.removeEventListener('mouseup', stopDragging);
    }
}

function showImageControls(x, y) {
    const controls = document.getElementById('imageControls');
    
    // Adjust position to keep controls on screen
    const controlsWidth = 220;
    const controlsHeight = 280;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + controlsWidth > screenWidth) {
        adjustedX = x - controlsWidth;
    }
    if (y + controlsHeight > screenHeight) {
        adjustedY = y - controlsHeight;
    }
    
    controls.style.left = Math.max(10, adjustedX) + 'px';
    controls.style.top = Math.max(10, adjustedY) + 'px';
    controls.style.display = 'block';
}

function hideImageControls() {
    document.getElementById('imageControls').style.display = 'none';
}

// Enhanced rotation function
function rotateImage(degrees) {
    if (!selectedImage) return;
    
    const currentRotation = parseFloat(selectedImage.dataset.rotation) || 0;
    const newRotation = currentRotation + degrees;
    
    selectedImage.dataset.rotation = newRotation;
    updateImageTransform();
    updateImagePosition();
    
    showNotification(`Rotated ${degrees > 0 ? 'right' : 'left'} by ${Math.abs(degrees)}°`, 'info');
}

// NEW: Tilt functions
function tiltImage(tiltX, tiltY) {
    if (!selectedImage) return;
    
    const currentTiltX = parseFloat(selectedImage.dataset.tiltX) || 0;
    const currentTiltY = parseFloat(selectedImage.dataset.tiltY) || 0;
    
    const newTiltX = Math.max(-45, Math.min(45, currentTiltX + tiltX));
    const newTiltY = Math.max(-45, Math.min(45, currentTiltY + tiltY));
    
    selectedImage.dataset.tiltX = newTiltX;
    selectedImage.dataset.tiltY = newTiltY;
    updateImageTransform();
    updateImagePosition();
    
    const direction = tiltX !== 0 ? (tiltX > 0 ? 'right' : 'left') : (tiltY > 0 ? 'down' : 'up');
    showNotification(`Tilted ${direction} by ${Math.abs(tiltX || tiltY)}°`, 'info');
}

function resetTilt() {
    if (!selectedImage) return;
    
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransform();
    updateImagePosition();
    
    showNotification('Tilt reset', 'success');
}

function resetTransforms() {
    if (!selectedImage) return;
    
    selectedImage.dataset.rotation = 0;
    selectedImage.dataset.scale = 1;
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransform();
    updateImagePosition();
    
    showNotification('All transformations reset', 'success');
}

// Enhanced scale function
function scaleImage(factor) {
    if (!selectedImage) return;
    
    const currentScale = parseFloat(selectedImage.dataset.scale) || 1;
    const newScale = Math.max(0.3, Math.min(3, currentScale * factor));
    
    selectedImage.dataset.scale = newScale;
    updateImageTransform();
    updateImagePosition();
    
    const action = factor > 1 ? 'enlarged' : 'shrunk';
    showNotification(`Image ${action}`, 'info');
}

// NEW: Update transform function that handles rotation, scale, and tilt
function updateImageTransform() {
    if (!selectedImage) return;
    
    const rotation = parseFloat(selectedImage.dataset.rotation) || 0;
    const scale = parseFloat(selectedImage.dataset.scale) || 1;
    const tiltX = parseFloat(selectedImage.dataset.tiltX) || 0;
    const tiltY = parseFloat(selectedImage.dataset.tiltY) || 0;
    
    const transforms = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (scale !== 1) transforms.push(`scale(${scale})`);
    if (tiltX || tiltY) transforms.push(`skew(${tiltX}deg, ${tiltY}deg)`);
    
    selectedImage.style.transform = transforms.join(' ');
}

function deleteImage() {
    if (!selectedImage) return;
    
    if (confirm('Are you sure you want to delete this image?')) {
        selectedImage.remove();
        selectedImage = null;
        hideImageControls();
        showNotification('Image deleted successfully', 'success');
    }
}

async function updateImagePosition() {
    if (!selectedImage) return;
    
    const filename = selectedImage.dataset.filename;
    const position_x = parseInt(selectedImage.style.left);
    const position_y = parseInt(selectedImage.style.top);
    const rotation = parseFloat(selectedImage.dataset.rotation) || 0;
    const scale = parseFloat(selectedImage.dataset.scale) || 1;
    const tilt_x = parseFloat(selectedImage.dataset.tiltX) || 0;
    const tilt_y = parseFloat(selectedImage.dataset.tiltY) || 0;
    
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
                rotation,
                scale,
                tilt_x,
                tilt_y,
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

// Image upload
function setupEventListeners() {
    document.getElementById('imageUpload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            pendingImageFile = file;
            document.getElementById('captionModal').style.display = 'block';
            document.getElementById('captionInput').focus();
        }
    });
    
    // Close controls when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.image-controls') && !e.target.closest('.diary-image') && !e.target.closest('.help-toggle')) {
            hideImageControls();
        }
        
        if (!e.target.closest('.diary-image')) {
            document.querySelectorAll('.diary-image').forEach(img => {
                img.classList.remove('selected');
            });
            selectedImage = null;
        }
        
        if (!e.target.closest('.keyboard-help')) {
            document.getElementById('keyboardHelp').style.display = 'none';
        }
    });
    
    // Auto-save diary content
    document.getElementById('diaryText').addEventListener('input', debounce(saveDiary, 2000));
    
    // Enhanced keyboard shortcuts
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
                case 'r':
                    e.preventDefault();
                    resetTransforms();
                    break;
            }
        }
        
        // Tilt shortcuts with Shift key
        if (selectedImage && e.shiftKey) {
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    tiltImage(-5, 0);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    tiltImage(5, 0);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    tiltImage(0, -5);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    tiltImage(0, 5);
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
}

async function saveCaptionAndUpload() {
    if (!pendingImageFile) return;
    
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
            
            // Create image element with default tilt values
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
    document.getElementById('captionModal').style.display = 'none';
    document.getElementById('captionInput').value = '';
    pendingImageFile = null;
    document.getElementById('imageUpload').value = '';
}

function toggleKeyboardHelp() {
    const help = document.getElementById('keyboardHelp');
    help.style.display = help.style.display === 'none' ? 'block' : 'none';
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
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

// Modal event listeners
document.getElementById('captionInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        saveCaptionAndUpload();
    }
});

// Touch support for mobile devices
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', function(e) {
    if (e.target.closest('.diary-image')) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
});

document.addEventListener('touchmove', function(e) {
    if (selectedImage && isDragging) {
        e.preventDefault();
        const touch = e.touches[0];
        const containerRect = document.getElementById('imagesContainer').getBoundingClientRect();
        
        let newX = touch.clientX - containerRect.left - dragOffset.x;
        let newY = touch.clientY - containerRect.top - dragOffset.y;
        
        newX = Math.max(0, Math.min(newX, containerRect.width - selectedImage.offsetWidth));
        newY = Math.max(0, Math.min(newY, containerRect.height - selectedImage.offsetHeight));
        
        selectedImage.style.left = newX + 'px';
        selectedImage.style.top = newY + 'px';
    }
});

document.addEventListener('touchend', function(e) {
    if (isDragging && selectedImage) {
        stopDragging();
    }
});

// Additional helper functions for advanced tilt operations
function getTiltFromTransform(transform) {
    const skewMatch = transform.match(/skew\(([^,]+),?\s*([^)]*)\)/);
    if (skewMatch) {
        return {
            x: parseFloat(skewMatch[1]) || 0,
            y: parseFloat(skewMatch[2]) || 0
        };
    }
    return { x: 0, y: 0 };
}

function getRotationFromTransform(transform) {
    const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
    return rotateMatch ? parseFloat(rotateMatch[1]) : 0;
}

function getScaleFromTransform(transform) {
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    return scaleMatch ? parseFloat(scaleMatch[1]) : 1;
}

// Advanced image manipulation presets
function applyImagePreset(preset) {
    if (!selectedImage) return;
    
    switch(preset) {
        case 'vintage-tilt':
            selectedImage.dataset.rotation = -3;
            selectedImage.dataset.tiltX = -2;
            selectedImage.dataset.tiltY = 1;
            break;
        case 'dramatic-lean':
            selectedImage.dataset.rotation = -8;
            selectedImage.dataset.tiltX = -5;
            selectedImage.dataset.tiltY = 0;
            break;
        case 'perspective-left':
            selectedImage.dataset.rotation = 0;
            selectedImage.dataset.tiltX = -10;
            selectedImage.dataset.tiltY = -3;
            break;
        case 'perspective-right':
            selectedImage.dataset.rotation = 0;
            selectedImage.dataset.tiltX = 10;
            selectedImage.dataset.tiltY = -3;
            break;
        default:
            return;
    }
    
    updateImageTransform();
    updateImagePosition();
    showNotification(`Applied ${preset} preset`, 'success');
}

// Initialize the application
console.log('Digital Diary with Image Tilting initialized');
console.log('Available features:');
console.log('- Image rotation: Right-click image → Rotate buttons');
console.log('- Image tilting: Right-click image → Tilt buttons');
console.log('- Image scaling: Right-click image → Scale buttons');
console.log('- Keyboard shortcuts: Shift + Arrow keys for tilting');
console.log('- Drag and drop: Click and drag images to reposition');