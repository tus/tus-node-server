# S3 Object Prefix Implementation - Summary

## Changes Made

I've successfully implemented the S3 object prefix feature that allows you to organize uploaded files in folder structures within your S3 bucket.

### Modified Files

**`/packages/s3-store/src/index.ts`**

1. **Added `objectPrefix` option to the `Options` type** (line ~49):
   ```typescript
   objectPrefix?: string
   ```
   - Optional parameter
   - Used to create pseudo-directory structures in S3
   - Example: `"uploads/"` or `"my-app/files/2024/"`

2. **Added `objectPrefix` class property** (line ~109):
   ```typescript
   protected objectPrefix: string
   ```

3. **Initialize `objectPrefix` in constructor** (line ~116):
   ```typescript
   this.objectPrefix = objectPrefix ?? ''
   ```
   - Defaults to empty string if not provided (maintains backward compatibility)

4. **Updated `infoKey()` method** (line ~224):
   ```typescript
   protected infoKey(id: string) {
     return `${this.objectPrefix}${id}.info`
   }
   ```

5. **Updated `partKey()` method** (line ~228):
   ```typescript
   protected partKey(id: string, isIncomplete = false) {
     if (isIncomplete) {
       id += '.part'
     }
     return `${this.objectPrefix}${id}`
   }
   ```

6. **Updated all S3 operations to use the prefix**:
   - `uploadPart()` - Uses `this.partKey(metadata.file.id)`
   - `create()` - Uses `this.partKey(upload.id)` for Key
   - `read()` - Uses `this.partKey(id)`
   - `finishMultipartUpload()` - Uses `this.partKey(metadata.file.id)`
   - `retrieveParts()` - Uses `this.partKey(id)`
   - `remove()` - Uses `this.partKey(id)` and `this.infoKey(id)`

### Created Files

**`/packages/s3-store/OBJECT_PREFIX_EXAMPLE.md`**
- Complete usage documentation
- Before/after examples showing folder structures
- Multiple use cases (single folder, nested folders)

## How It Works

### Without objectPrefix (default behavior):
```
my-bucket/
  ├── file-abc123
  ├── file-abc123.info
  ├── file-xyz789
  └── file-xyz789.info
```

### With objectPrefix: 'uploads/':
```
my-bucket/
  └── uploads/
      ├── file-abc123
      ├── file-abc123.info
      ├── file-xyz789
      └── file-xyz789.info
```

### With objectPrefix: 'my-app/uploads/2024/':
```
my-bucket/
  └── my-app/
      └── uploads/
          └── 2024/
              ├── file-abc123
              ├── file-abc123.info
              ├── file-xyz789
              └── file-xyz789.info
```

## Usage Example

```typescript
import {S3Store} from '@tus/s3-store';

const store = new S3Store({
  objectPrefix: 'uploads/',  // Add this line!
  
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'YOUR_ACCESS_KEY',
      secretAccessKey: 'YOUR_SECRET_KEY',
    },
  },
});

// Now all uploads will be stored in the 'uploads/' folder
```

## Backward Compatibility

✅ **Fully backward compatible** - If `objectPrefix` is not provided, it defaults to an empty string, maintaining the current behavior of storing files at the bucket root.

## Testing Recommendations

1. Test with no prefix (default behavior)
2. Test with single folder: `'uploads/'`
3. Test with nested folders: `'my-app/uploads/2024/'`
4. Test with prefix without trailing slash (should still work)
5. Verify all operations work:
   - Upload files
   - Resume uploads
   - Read files
   - Delete files
   - List expired files

## Benefits

- **Organization**: Keep uploads organized in logical folder structures
- **Multi-tenant**: Separate uploads by user/tenant: `'users/user-123/uploads/'`
- **Time-based**: Organize by date: `'uploads/2024/10/'`
- **Environment separation**: Different folders for dev/staging/prod
- **Easier lifecycle policies**: Apply S3 lifecycle rules to specific prefixes
- **Better billing analysis**: Track storage costs by prefix

## Notes

- The prefix applies to all S3 objects: main files, `.info` metadata files, and `.part` incomplete files
- Make sure to include trailing slash for folder-like structures
- S3 doesn't have real folders - prefixes create a "pseudo-directory" structure
- All existing code continues to work without any changes
