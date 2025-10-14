import {Server} from '@tus/server';
import {S3Store} from '@tus/s3-store';
import express from 'express';

// Example 1: Basic usage with uploads folder
const basicStore = new S3Store({
  objectPrefix: 'uploads/',
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});

// Example 2: Multi-tenant application
const createTenantStore = (tenantId: string) => {
  return new S3Store({
    objectPrefix: `tenants/${tenantId}/uploads/`,
    s3ClientConfig: {
      bucket: 'my-multi-tenant-bucket',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  });
};

// Example 3: Environment-based organization
const envPrefix = process.env.NODE_ENV === 'production' ? 'prod/' : 'dev/';
const envStore = new S3Store({
  objectPrefix: `${envPrefix}uploads/`,
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});

// Example 4: Date-based organization
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const dateBasedStore = new S3Store({
  objectPrefix: `uploads/${year}/${month}/`,
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});

// Example 5: Full Express server implementation
const app = express();

// Setup tus server with S3 store
const tusServer = new Server({
  path: '/files',
  datastore: new S3Store({
    objectPrefix: 'uploads/',
    partSize: 8 * 1024 * 1024, // 8MB
    s3ClientConfig: {
      bucket: process.env.S3_BUCKET!,
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  }),
});

app.all('/files/*', (req, res) => {
  tusServer.handle(req, res);
});

// Example 6: Per-user uploads with middleware
app.all('/user-uploads/*', (req, res) => {
  // Extract user ID from authentication (simplified example)
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  
  const userTusServer = new Server({
    path: '/user-uploads',
    datastore: new S3Store({
      objectPrefix: `users/${userId}/uploads/`,
      s3ClientConfig: {
        bucket: process.env.S3_BUCKET!,
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      },
    }),
  });
  
  userTusServer.handle(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload endpoint: http://localhost:${PORT}/files`);
});

// Example 7: Document type segregation
const createDocumentStore = (documentType: 'images' | 'videos' | 'documents') => {
  return new S3Store({
    objectPrefix: `media/${documentType}/`,
    s3ClientConfig: {
      bucket: 'my-media-bucket',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  });
};

// Example 8: Advanced - Lifecycle policy friendly structure
// With this structure, you can set S3 lifecycle policies per prefix
// e.g., delete temp uploads after 7 days, archive old uploads after 90 days
const lifecycleFriendlyStore = new S3Store({
  // Temp uploads can have a lifecycle policy to delete after 7 days
  objectPrefix: 'temp-uploads/',
  expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000, // 7 days
  s3ClientConfig: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
});

/*
Example S3 Lifecycle Policy for the above setup:

{
  "Rules": [
    {
      "Id": "DeleteTempUploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "temp-uploads/"
      },
      "Expiration": {
        "Days": 7
      }
    },
    {
      "Id": "ArchiveOldUploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
*/
