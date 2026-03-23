import formidable from 'formidable';
import { extname } from 'path';
import { parseRequestBodyWithLimit } from '../../utils/storage.js';
import { JSON_CREATE_MAX_BYTES, MAX_FILE_SIZE_MB } from './validators.js';

export async function parseCreateJsonBody(req) {
  return parseRequestBodyWithLimit(req, { maxBytes: JSON_CREATE_MAX_BYTES });
}

export async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
      keepExtensions: true,
    });

    form.parse(req, (error, fields, files) => {
      if (error) {
        if (error.code === 1009 || error.message?.includes('maxFileSize')) {
          reject(Object.assign(new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB)`), { status: 413 }));
          return;
        }

        reject(error);
        return;
      }

      const normalizedFields = Object.fromEntries(
        Object.entries(fields).map(([fieldName, fieldValue]) => [
          fieldName,
          Array.isArray(fieldValue) ? fieldValue[0] : fieldValue,
        ]),
      );
      resolve({ fields: normalizedFields, files });
    });
  });
}

export function getUploadedFile(files) {
  if (!files.file) {
    return null;
  }

  return Array.isArray(files.file) ? files.file[0] : files.file;
}

export function getUploadedFileExtension(uploadedFile) {
  return extname(uploadedFile.originalFilename || '').toLowerCase();
}
