import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ScriptController } from './script.controller';
import { ScriptService } from './script.service';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { Product } from 'src/schemas/products.schema';

describe('ScriptController', () => {
  let controller: ScriptController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScriptController],
      providers: [
        ScriptService,
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        { provide: getModelToken(CompanyCategory.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
      ],
    }).compile();

    controller = module.get<ScriptController>(ScriptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
