/* global tus */
/* eslint no-console: 0 */

var upload = null;
var alertEl = document.querySelector('.js-support-alert');
var endpointInputEl = document.querySelector('.js-upload-endpoint');
var resumeEndpointInputEl = document.querySelector('.js-resume-endpoint');
var chunkInputEl = document.querySelector('.js-chunk-size');
var stopBtnEl = document.querySelector('.js-stop-button');
var resumeBtnEl = document.querySelector('.js-resume-button');
var inputEl = document.querySelector('input[type=file]');
var progressBar = document.querySelector('.progress-bar');


if (!tus.isSupported) {
    alertEl.classList.toggle('hidden');
}

stopBtnEl.addEventListener('click', function(e) {
    e.preventDefault();

    if (upload) {
        upload.abort();
        resumeBtnEl.classList.remove('disabled');
        stopBtnEl.classList.add('disabled');
    }
});

resumeBtnEl.addEventListener('click', function(e) {
    e.preventDefault();
    if (upload) {
        resumeBtnEl.classList.add('disabled');
        stopBtnEl.classList.remove('disabled');
        upload._resumeUpload();
    }
});

function reset() {
    inputEl.value = '';
    stopBtnEl.classList.add('disabled');
}

inputEl.addEventListener('change', function(e) {
    var file = e.target.files[0];
    // Only continue if a file has actually been selected.
    // IE will trigger a change event if we reset the input element
    // inside reset() and we do not want to blow up later.
    if (!file) {
        return;
    }

    console.log('selected file', file);

    stopBtnEl.classList.remove('disabled');
    var chunkSize = parseInt(chunkInputEl.value, 10);
    if (isNaN(chunkSize)) {
        chunkSize = Infinity;
    }

    var options = {
        endpoint: endpointInputEl.value,
        chunkSize: chunkSize,
        metadata: {
            filename: file.name,
        },
        onError: function(error) {
            if (error.originalRequest) {
                if (confirm('Failed because: ' + error + '\nDo you want to retry?')) {
                    options.resume = false;
                    options.uploadUrl = upload.url;
                    upload = new tus.Upload(file, options);
                    upload.start();
                    return;
                }
            } else {
                alert('Failed because: ' + error);
            }

            reset();
        },
        onProgress: function(bytesUploaded, bytesTotal) {
            var percentage = (bytesUploaded / bytesTotal * 100).toFixed(2);
            progressBar.style.width = percentage + '%';
            progressBar.textContent = percentage + '%';
            progressBar.setAttribute('aria-valuenow', percentage);
            console.log(bytesUploaded, bytesTotal, percentage + '%');
        },
        onSuccess: function() {
            reset();
        },
    };

    if (resumeEndpointInputEl.value !== '') {
        options.uploadUrl = resumeEndpointInputEl.value;
    }

    upload = new tus.Upload(file, options);
    upload.start();
});

