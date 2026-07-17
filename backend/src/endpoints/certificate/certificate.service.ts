import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Company } from 'src/schemas/company.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Certificate } from 'src/schemas/certificate.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { envConstants } from 'src/common/env.constants';

@Injectable()
export class CertificateService {
  constructor(
    @InjectModel(Company.name)
    private companyModel: Model<Company>,
    @InjectModel(CompanyUser.name)
    private CompanyUserModel: Model<CompanyUser>,
    @InjectModel(Certificate.name)
    private certificateModel: Model<Certificate>,
  ) {}
  private readonly icidUrl = envConstants.icidServiceBackendUrl;
  private readonly ENCRYPTION_SECRET = envConstants.hederaKeySecret;

  encryptPrivateKey(privateKeyStr: string): string {
    if (!this.ENCRYPTION_SECRET) {
      throw new HttpException(
        'Certificates are not configured on this instance (HEDERA_KEY_SECRET not set)',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.ENCRYPTION_SECRET),
      iv,
    );
    let encrypted = cipher.update(privateKeyStr, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decryptPrivateKey(encryptedStr: string): string {
    if (!this.ENCRYPTION_SECRET) {
      throw new HttpException(
        'Certificates are not configured on this instance (HEDERA_KEY_SECRET not set)',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    const [ivHex, encryptedHex] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.ENCRYPTION_SECRET),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  async generateCompanyCertificate(
    company_ifric_id: string,
    expiry: Date,
    user_email: string,
  ) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      // create a new certificate if it is expired
      const response = await axios.post(
        `${this.icidUrl}/certificate/create-company-certificate`,
        {
          company_ifric_id,
          expiry,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const certificate_data = response.data.keyPair.publicKey;
      const userData = await this.CompanyUserModel.find({ user_email });

      if (!userData.length) {
        throw new HttpException(
          'No user found with the provided mailId',
          HttpStatus.NOT_FOUND,
        );
      }

      const certificateValue = new this.certificateModel({
        created_on: new Date(),
        expiry_on: new Date(expiry),
        company_id: companyData[0].id,
        user_id: userData[0].id,
        certificate_data: certificate_data,
        private_key: this.encryptPrivateKey(response.data.keyPair.privateKey),
        hedera_did_id: response.data.did,
        hedera_file_id: response.data.fileId,
        hedera_account_id: response.data.accountId,
      });

      await certificateValue.save();
      return {
        success: true,
        status: 201,
        message: 'Certificate created successfully',
      };
    } catch (err) {
      if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyCertificate(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });

      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.certificateModel
        .find({ company_id: companyData[0].id })
        .sort({ expiry_on: -1, created_on: -1 });
    } catch (err) {
      if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async revealPrivateKey(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });

      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const record = await this.certificateModel
        .find({ company_id: companyData[0].id })
        .sort({ expiry_on: -1, created_on: -1 });
      if (!record.length) {
        throw new HttpException(
          'No certificate found for this company',
          HttpStatus.NOT_FOUND,
        );
      }
      if (record[0].private_key !== '') {
        const decryptedPrivateKey = this.decryptPrivateKey(
          record[0].private_key,
        );
        // Return the decrypted private key
        return {
          success: true,
          status: 200,
          private_key: decryptedPrivateKey,
        };
      } else {
        throw new HttpException(
          'Private key is already revealed',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async verifyCompanyCertificate(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });

      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const certificateData = await this.certificateModel
        .find({ company_id: companyData[0].id })
        .sort({ expiry_on: -1, created_on: -1 });
      if (!certificateData.length) {
        return { data: false };
      }

      if (certificateData[0].expiry_on < new Date()) {
        return { data: false };
      }

      if (!certificateData[0].hedera_file_id) {
        return { data: true };
      }

      const verifiedResponse = await axios.post(
        `${this.icidUrl}/certificate/verify-company-certificate`,
        {
          company_ifric_id,
          fileId: certificateData[0].hedera_file_id,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (verifiedResponse.data.revoked) {
        return { data: false };
      } else {
        return { data: true };
      }
    } catch (err) {
      if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async verifyAllCompanyCertificate(company_ifric_ids: string[]) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: { $in: company_ifric_ids },
      });

      if (!companyData.length) {
        throw new HttpException(
          'No companies found with the provided IDs',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyMap = companyData.reduce(
        (acc, company) => {
          acc[company._id.toString()] = company.company_ifric_id;
          return acc;
        },
        {} as Record<string, string>,
      );

      const companyMongoIds = companyData.map((c) => c._id.toString());
      const certificates = await this.certificateModel.aggregate([
        { $match: { company_id: { $in: companyMongoIds } } },
        { $sort: { expiry_on: -1, created_on: -1 } },
        { $group: { _id: '$company_id', certData: { $first: '$$ROOT' } } },
      ]);

      if (!certificates.length) {
        // Return false if no companies has certificate
        return company_ifric_ids.reduce(
          (acc, id) => {
            acc[id] = false;
            return acc;
          },
          {} as Record<string, boolean>,
        );
      }

      const batchSize = 50;
      let result: Record<string, boolean> = {};

      for (let i = 0; i < certificates.length; i += batchSize) {
        const batch = certificates.slice(i, i + batchSize);
        const icidPassingIds = [];
        // iterate for batch wise certs to get ids need to pass for icid call
        for (let j = 0; j < batch.length; j++) {
          const company_ifric_id = companyMap[batch[j]._id.toString()];
          if (batch[j].certData.expiry_on < new Date()) {
            result[company_ifric_id] = false;
          } else if (!batch[j].certData.hedera_file_id) {
            result[company_ifric_id] = true;
            continue;
          } else {
            icidPassingIds.push({
              company_ifric_id,
              fieldId: batch[j].certData.hedera_file_id,
            });
          }
        }

        // pass all the ids for single call
        if (icidPassingIds.length) {
          const response = await axios.post(
            `${this.icidUrl}/certificate/verify-all-company-certificate`,
            icidPassingIds,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
          result = { ...result, ...response.data };
        }
      }

      return result;
    } catch (err) {
      if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async updateLatestCompanyCertificateExpiry(
    company_ifric_id: string,
    expiry: Date,
  ) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const today = new Date();
      const latestCert = await this.certificateModel
        .find({
          company_id: companyData[0].id,
          expiry_on: { $gt: today },
        })
        .sort({ expiry_on: -1, created_on: -1 });

      latestCert.forEach(async (cert) => {
        await this.certificateModel.updateOne(
          { _id: cert._id },
          { $set: { expiry_on: new Date(expiry) } },
        );
      });

      return HttpStatus.CREATED;
    } catch (err) {
      throw new HttpException(err, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deletePrivateKey(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const record = await this.certificateModel
        .find({ company_id: companyData[0].id })
        .sort({ expiry_on: -1, created_on: -1 });
      if (!record.length) {
        throw new HttpException(
          'No certificate found for this company',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.certificateModel.updateOne(
        { _id: record[0]._id },
        { $set: { private_key: '' } },
      );
      return {
        success: true,
        status: 204,
        message: 'Private Key deleted successfully.',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
}
