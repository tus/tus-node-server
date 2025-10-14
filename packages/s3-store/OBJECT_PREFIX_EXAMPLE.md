# S3 Object Prefix Example

The S3Store now supports an `objectPrefix` option that allows you to organize your uploads in a folder structure within your S3 bucket.

## Usage

```typescript
import {S3Store} from '@tus/s3-store';

const store = new S3Store({
  // Specify a folder path for your uploads
  objectPrefix: 'uploads/',  // Files will be stored as: uploads/<file-id>
  
  // Or create nested folders
  // objectPrefix: 'my-app/uploads/2024/',  // Files: my-app/uploads/2024/<file-id>
  
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'your-access-key',
      secretAccessKey: 'your-secret-key',
    },
  },
});
```

## Before and After

### Without `objectPrefix` (default):
```
my-bucket/
  ├── file-id-1
  ├── file-id-1.info
  ├── file-id-2
  └── file-id-2.info
```

### With `objectPrefix: 'uploads/'`:
```
my-bucket/
  └── uploads/
      ├── file-id-1
      ├── file-id-1.info
      ├── file-id-2
      └── file-id-2.info
```

### With `objectPrefix: 'my-app/uploads/2024/'`:
```
my-bucket/
  └── my-app/
      └── uploads/
          └── 2024/
              ├── file-id-1
              ├── file-id-1.info
              ├── file-id-2
              └── file-id-2.info
```

## Notes

- The prefix is optional - if not provided, files will be stored at the bucket root (current behavior)
- Make sure to include a trailing slash if you want a folder-like structure
- The prefix applies to both the upload file and its `.info` metadata file
- The prefix is also applied to incomplete parts (`.part` files)
