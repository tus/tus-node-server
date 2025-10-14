# Quick Reference: S3 Object Prefix

## TL;DR

Add `objectPrefix` to your S3Store configuration to organize files in folders:

```typescript
const store = new S3Store({
  objectPrefix: 'uploads/',  // ← Add this!
  s3ClientConfig: { /* ... */ }
});
```

## Common Use Cases

### 1. Simple folder organization
```typescript
objectPrefix: 'uploads/'
// Result: bucket/uploads/file-id
```

### 2. Multi-tenant application
```typescript
objectPrefix: `tenants/${tenantId}/uploads/`
// Result: bucket/tenants/abc-123/uploads/file-id
```

### 3. Date-based organization
```typescript
const date = new Date();
objectPrefix: `uploads/${date.getFullYear()}/${date.getMonth() + 1}/`
// Result: bucket/uploads/2024/10/file-id
```

### 4. Environment separation
```typescript
const env = process.env.NODE_ENV;
objectPrefix: `${env}/uploads/`
// Result: bucket/production/uploads/file-id or bucket/dev/uploads/file-id
```

### 5. File type segregation
```typescript
objectPrefix: 'media/images/'
// Result: bucket/media/images/file-id
```

### 6. User-specific uploads
```typescript
objectPrefix: `users/${userId}/files/`
// Result: bucket/users/user-456/files/file-id
```

## What Gets Prefixed?

✅ Main upload file: `bucket/prefix/file-id`
✅ Info metadata file: `bucket/prefix/file-id.info`
✅ Incomplete parts: `bucket/prefix/file-id.part`

## Tips

- Always use trailing slash for folder-like structure: `'uploads/'` ✅ not `'uploads'`
- Prefix is optional - without it, files go to bucket root (backward compatible)
- S3 doesn't have real folders - prefixes create visual organization
- Use prefixes to apply different lifecycle policies to different file types
- Combine with S3 bucket policies for fine-grained access control

## S3 Console View

With `objectPrefix: 'uploads/'`, your S3 console will show:

```
📁 my-bucket
  └── 📁 uploads
      ├── 📄 file-abc123
      ├── 📄 file-abc123.info
      ├── 📄 file-xyz789
      └── 📄 file-xyz789.info
```

Without prefix:

```
📁 my-bucket
  ├── 📄 file-abc123
  ├── 📄 file-abc123.info
  ├── 📄 file-xyz789
  └── 📄 file-xyz789.info
```

## Complete Example

```typescript
import {Server} from '@tus/server';
import {S3Store} from '@tus/s3-store';

const tusServer = new Server({
  path: '/files',
  datastore: new S3Store({
    objectPrefix: 'uploads/',
    s3ClientConfig: {
      bucket: 'my-bucket',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  }),
});
```

## Migration from No Prefix

If you're adding a prefix to an existing setup:

1. **Option A**: Keep old files where they are, new files use prefix (recommended)
2. **Option B**: Use AWS CLI to move existing files:
   ```bash
   aws s3 mv s3://my-bucket/ s3://my-bucket/uploads/ --recursive
   ```

## Benefits

🎯 **Organization**: Logical folder structure
🔐 **Security**: Apply IAM policies per prefix  
💰 **Cost**: Track storage costs by prefix
⏰ **Lifecycle**: Different retention policies per folder
🧹 **Cleanup**: Easy to delete all files in a prefix
📊 **Analytics**: Better insights with S3 analytics
