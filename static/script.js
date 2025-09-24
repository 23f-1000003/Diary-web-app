// Global variables
let currentDate = new Date();
let selectedImage = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let pendingImageFile = null;
let saveTimeout = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    updateDateDisplay();
    loadDiaryEntry();
    setupImageUpload();
    setupKeyboardShortcuts();
    
    // Auto-save diary text with debouncing
    const diaryText = document.getElementById('diaryText');
    diaryText.addEventListener('input', function() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveDiary(false); // Silent save
        }, 2000); // Save after 2 seconds of no typing
    });
    
    // Save immediately when textarea loses focus
    diaryText.addEventListener('blur', function() {
        clearTimeout(saveTimeout);
        saveDiary(false);
    });
});

function updateDateDisplay() {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('en-US', options);
}

function formatDateForAPI(date) {
    return date.toISOString().split('T')[0];
}

async function loadDiaryEntry() {
    const dateStr = formatDateForAPI(currentDate);
    
    try {
        const response = await fetch(`/api/diary/${dateStr}`);
        const data = await response.json();
        
        if (response.ok) {
            // Load text content
            document.getElementById('diaryText').value = data.content || '';
            
            // Clear existing images
            const container = document.getElementById('imagesContainer');
            container.innerHTML = '';
            
            // Load images
            if (data.images && data.images.length > 0) {
                data.images.forEach(imageData => {
                    createImageElement(imageData);
                });
            }
        } else {
            console.error('Failed to load diary entry:', data.error);
        }
    } catch (error) {
        console.error('Error loading diary entry:', error);
        showNotification('Failed to load diary entry', 'error');
    }
}

async function saveDiary(showNotification = true) {
    const dateStr = formatDateForAPI(currentDate);
    const content = document.getElementById('diaryText').value;
    
    try {
        const response = await fetch(`/api/diary/${dateStr}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: content })
        });
        
        const data = await response.json();
        
        if (response.ok && showNotification) {
            showNotification('Diary saved successfully!', 'success');
        } else if (!response.ok) {
            console.error('Failed to save diary:', data.error);
            if (showNotification) {
                showNotification('Failed to save diary', 'error');
            }
        }
    } catch (error) {
        console.error('Error saving diary:', error);
        if (showNotification) {
            showNotification('Failed to save diary', 'error');
        }
    }
}

function changeDate(days) {
    // Save current entry before changing date
    saveDiary(false);
    
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    loadDiaryEntry();
    hideImageControls();
}

function goToToday() {
    // Save current entry before going to today
    saveDiary(false);
    
    currentDate = new Date();
    updateDateDisplay();
    loadDiaryEntry();
    hideImageControls();
}

function setupImageUpload() {
    document.getElementById('imageUpload').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            pendingImageFile = e.target.files[0];
            showCaptionModal();
        }
    });
}

function showCaptionModal() {
    document.getElementById('captionModal').style.display = 'flex';
    document.getElementById('captionInput').focus();
}

function closeCaptionModal() {
    document.getElementById('captionModal').style.display = 'none';
    document.getElementById('captionInput').value = '';
    pendingImageFile = null;
    document.getElementById('imageUpload').value = '';
}

async function saveCaptionAndUpload() {
    if (!pendingImageFile) return;
    
    const caption = document.getElementById('captionInput').value;
    const dateStr = formatDateForAPI(currentDate);
    
    const formData = new FormData();
    formData.append('image', pendingImageFile);
    formData.append('date', dateStr);
    formData.append('caption', caption);
    
    try {
        const response = await fetch('/api/upload_image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Image uploaded successfully!', 'success');
            loadDiaryEntry(); // Reload to show the new image
            closeCaptionModal();
        } else {
            showNotification(data.error || 'Failed to upload image', 'error');
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Failed to upload image', 'error');
    }
}

function createImageElement(imageData) {
    const container = document.getElementById('imagesContainer');
    const img = document.createElement('img');
    
    img.src = `/static/uploads/${imageData.filename}`;
    img.className = 'diary-image';
    img.style.position = 'absolute';
    img.style.left = imageData.position_x + 'px';
    img.style.top = imageData.position_y + 'px';
    img.style.zIndex = imageData.z_index || 1;
    img.title = imageData.caption || '';
    
    // Store data attributes
    img.dataset.filename = imageData.filename;
    img.dataset.caption = imageData.caption || '';
    img.dataset.rotation = imageData.rotation || 0;
    img.dataset.scale = imageData.scale || 1;
    img.dataset.tiltX = imageData.tilt_x || 0;
    img.dataset.tiltY = imageData.tilt_y || 0;
    
    // Apply transforms
    updateImageTransform(img);
    
    // Add event listeners
    setupImageEvents(img);
    
    container.appendChild(img);
}

function setupImageEvents(img) {
    // Click to select
    img.addEventListener('click', function(e) {
        e.stopPropagation();
        selectImage(img);
    });
    
    // Right-click for controls
    img.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        selectImage(img);
        showImageControls(e.pageX, e.pageY);
    });
    
    // Drag functionality
    img.addEventListener('mousedown', function(e) {
        if (e.button === 0) { // Left mouse button
            e.preventDefault();
            selectImage(img);
            startDragging(e);
        }
    });
}

function selectImage(img) {
    // Remove selection from other images
    document.querySelectorAll('.diary-image').forEach(image => {
        image.classList.remove('selected');
    });
    
    // Select this image
    img.classList.add('selected');
    selectedImage = img;
}

function startDragging(e) {
    if (!selectedImage) return;
    
    isDragging = true;
    const rect = selectedImage.getBoundingClientRect();
    const containerRect = document.getElementById('imagesContainer').getBoundingClientRect();
    
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDragging);
    
    selectedImage.style.cursor = 'grabbing';
}

function handleDrag(e) {
    if (!isDragging || !selectedImage) return;
    
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
    if (!isDragging) return;
    
    isDragging = false;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDragging);
    
    if (selectedImage) {
        selectedImage.style.cursor = 'grab';
        updateImageInDatabase();
    }
}

function showImageControls(x, y) {
    const controls = document.getElementById('imageControls');
    controls.style.display = 'block';
    controls.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    controls.style.top = Math.min(y, window.innerHeight - 300) + 'px';
}

function hideImageControls() {
    document.getElementById('imageControls').style.display = 'none';
    
    // Remove selection from all images
    document.querySelectorAll('.diary-image').forEach(image => {
        image.classList.remove('selected');
    });
    selectedImage = null;
}

// Image transformation functions
function rotateImage(degrees) {
    if (!selectedImage) return;
    
    const currentRotation = parseFloat(selectedImage.dataset.rotation) || 0;
    selectedImage.dataset.rotation = currentRotation + degrees;
    updateImageTransform();
    updateImageInDatabase();
}

function tiltImage(tiltX, tiltY) {
    if (!selectedImage) return;
    
    const currentTiltX = parseFloat(selectedImage.dataset.tiltX) || 0;
    const currentTiltY = parseFloat(selectedImage.dataset.tiltY) || 0;
    
    selectedImage.dataset.tiltX = currentTiltX + tiltX;
    selectedImage.dataset.tiltY = currentTiltY + tiltY;
    
    updateImageTransform();
    updateImageInDatabase();
}

function resetTilt() {
    if (!selectedImage) return;
    
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransform();
    updateImageInDatabase();
}

function scaleImage(factor) {
    if (!selectedImage) return;
    
    const currentScale = parseFloat(selectedImage.dataset.scale) || 1;
    const newScale = Math.max(0.1, Math.min(3, currentScale * factor));
    selectedImage.dataset.scale = newScale;
    updateImageTransform();
    updateImageInDatabase();
}

function resetTransforms() {
    if (!selectedImage) return;
    
    selectedImage.dataset.rotation = 0;
    selectedImage.dataset.scale = 1;
    selectedImage.dataset.tiltX = 0;
    selectedImage.dataset.tiltY = 0;
    updateImageTransform();
    updateImageInDatabase();
}

function updateImageTransform(img = selectedImage) {
    if (!img) return;
    
    const rotation = parseFloat(img.dataset.rotation) || 0;
    const scale = parseFloat(img.dataset.scale) || 1;
    const tiltX = parseFloat(img.dataset.tiltX) || 0;
    const tiltY = parseFloat(img.dataset.tiltY) || 0;
    
    const transform = `rotate(${rotation}deg) scale(${scale}) skew(${tiltX}deg, ${tiltY}deg)`;
    img.style.transform = transform;
}

async function deleteImage() {
    if (!selectedImage) return;
    
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    const filename = selectedImage.dataset.filename;
    
    try {
        const response = await fetch('/api/delete_image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename: filename })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            selectedImage.remove();
            hideImageControls();
            showNotification('Image deleted successfully', 'success');
        } else {
            showNotification(data.error || 'Failed to delete image', 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Failed to delete image', 'error');
    }
}

async function updateImageInDatabase() {
    if (!selectedImage) return;
    
    const filename = selectedImage.dataset.filename;
    const position_x = parseInt(selectedImage.style.left) || 0;
    const position_y = parseInt(selectedImage.style.top) || 0;
    const rotation = parseFloat(selectedImage.dataset.rotation) || 0;
    const scale = parseFloat(selectedImage.dataset.scale) || 1;
    const tilt_x = parseFloat(selectedImage.dataset.tiltX) || 0;
    const tilt_y = parseFloat(selectedImage.dataset.tiltY) || 0;
    const caption = selectedImage.dataset.caption || '';
    
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
            console.error('Failed to update image in database');
        }
    } catch (error) {
        console.error('Error updating image:', error);
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Save diary (Ctrl+S)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveDiary();
        }
        
        // Change date (Ctrl+Arrow)
        if (e.ctrlKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            changeDate(-1);
        }
        if (e.ctrlKey && e.key === 'ArrowRight') {
            e.preventDefault();
            changeDate(1);
        }
        
        // Image controls (when image is selected)
        if (selectedImage) {
            if (e.key === 'Delete') {
                e.preventDefault();
                deleteImage();
            }
            
            if (e.shiftKey) {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        tiltImage(-2, 0);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        tiltImage(2, 0);
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        tiltImage(0, -2);
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        tiltImage(0, 2);
                        break;
                }
            }
            
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                resetTransforms();
            }
        }
        
        if (e.key === 'Escape') {
            hideImageControls();
        }
    });
}

// Click outside to hide controls
document.addEventListener('click', function(e) {
    if (!e.target.closest('.image-controls') && !e.target.closest('.diary-image')) {
        hideImageControls();
    }
});

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function toggleKeyboardHelp() {
    const help = document.getElementById('keyboardHelp');
    help.style.display = help.style.display === 'none' ? 'block' : 'none';
}

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

// Modal event listeners
document.getElementById('captionInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        saveCaptionAndUpload();
    }
});

// Image presets
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
    updateImageInDatabase();
    showNotification(`Applied ${preset} preset`, 'success');
}

console.log('Digital Diary with Image Tilting initialized');