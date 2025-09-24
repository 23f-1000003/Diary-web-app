let currentDate = new Date().toISOString().split('T')[0];
let currentImages = [];
function createImageElement(imageData) {
    const container = document.getElementById('imagesContainer');
    
    // Create wrapper div
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'diary-image';
    imgWrapper.dataset.filename = imageData.filename;
    imgWrapper.dataset.rotation = imageData.rotation || 0;
    imgWrapper.dataset.scale = imageData.scale || 1;
    imgWrapper.dataset.tiltX = imageData.tilt_x || 0;
    imgWrapper.dataset.tiltY = imageData.tilt_y || 0;
    
    // Position the wrapper
    imgWrapper.style.left = (imageData.position_x || 0) + 'px';
    imgWrapper.style.top = (imageData.position_y || 0) + 'px';
    imgWrapper.style.zIndex = imageData.z_index || 1;
    
    // Create caption FIRST (this will appear at top due to flexbox order)
    if (imageData.caption) {
        const caption = document.createElement('div');
        caption.className = 'image-caption';
        caption.textContent = imageData.caption;
        imgWrapper.appendChild(caption);  // Add caption first
    }
    
    // Create image element SECOND
    const img = document.createElement('img');
    img.src = `/static/uploads/${imageData.filename}`;
    img.alt = imageData.caption || 'Diary photo';
    imgWrapper.appendChild(img);  // Add image after caption
    
    // Apply transforms
    updateImageTransform(imgWrapper);
    
    // Add event listeners
    setupImageEvents(imgWrapper);
    
    container.appendChild(imgWrapper);
}
document.addEventListener('DOMContentLoaded', function() {
    loadEntry(currentDate);
    updateDateDisplay();
    
    // Event listeners
    document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDate(1));
    document.getElementById('saveBtn').addEventListener('click', saveEntry);
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    
    // Auto-save every 30 seconds
    setInterval(saveEntry, 30000);
});

function changeDate(days) {
    // Save current entry before changing date
    saveEntry();
    
    const date = new Date(currentDate);
    date.setDate(date.getDate() + days);
    currentDate = date.toISOString().split('T')[0];
    
    updateDateDisplay();
    loadEntry(currentDate);
}

function updateDateDisplay() {
    const date = new Date(currentDate);
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = date.toLocaleDateString('en-US', options);
}

function loadEntry(date) {
    fetch(`/get_entry/${date}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('diaryText').value = data.content || '';
                currentImages = data.images || [];
                displayImages();
            } else {
                console.error('Error loading entry:', data.error);
                document.getElementById('diaryText').value = '';
                currentImages = [];
                displayImages();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            document.getElementById('diaryText').value = '';
            currentImages = [];
            displayImages();
        });
}

function saveEntry() {
    const content = document.getElementById('diaryText').value;
    
    fetch('/save_entry', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            date: currentDate,
            content: content
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Entry saved!', 'success');
        } else {
            showNotification('Error saving entry: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error saving entry', 'error');
    });
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const caption = prompt('Enter a caption for this image (optional):') || '';
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('date', currentDate);
    formData.append('caption', caption);
    
    fetch('/upload_image', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentImages.push({
                id: data.image_id,
                filename: data.filename,
                caption: data.caption
            });
            displayImages();
            showNotification('Image uploaded!', 'success');
        } else {
            showNotification('Error uploading image: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error uploading image', 'error');
    });
    
    // Clear the input
    event.target.value = '';
}

function displayImages() {
    const container = document.getElementById('imagesContainer');
    container.innerHTML = '';
    
    currentImages.forEach(image => {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'image-item';
        
        imageDiv.innerHTML = `
            <div class="image-caption">${image.caption}</div>
            <img src="/static/uploads/${image.filename}" alt="${image.caption}" class="diary-image">
            <button class="delete-btn" onclick="deleteImage(${image.id})">×</button>
        `;
        
        container.appendChild(imageDiv);
    });
}

function deleteImage(imageId) {
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    fetch('/delete_image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_id: imageId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Remove from currentImages array
            currentImages = currentImages.filter(img => img.id !== imageId);
            displayImages();
            showNotification('Image deleted!', 'success');
        } else {
            showNotification('Error deleting image: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error deleting image', 'error');
    });
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}