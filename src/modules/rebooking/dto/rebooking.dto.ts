import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RebookingSlotOptionDto {
  @IsString()
  date!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;
}

export class RebookingOverviewQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class GenerateRebookingMessageDto {
  @IsOptional()
  @IsIn(['slot_fill', 'cycle_followup'])
  campaignType?: 'slot_fill' | 'cycle_followup';

  @ValidateIf((value) => value.campaignType !== 'cycle_followup')
  @IsString()
  date!: string;

  @ValidateIf((value) => value.campaignType !== 'cycle_followup')
  @IsString()
  startTime!: string;

  @ValidateIf((value) => value.campaignType !== 'cycle_followup')
  @IsString()
  endTime!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  clientIds!: string[];

  @IsOptional()
  @IsIn(['soft', 'friendly'])
  tone?: 'soft' | 'friendly';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RebookingSlotOptionDto)
  slotOptions?: RebookingSlotOptionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  extraInstructions?: string;
}

export class SendRebookingCampaignDto extends GenerateRebookingMessageDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeAllClients?: boolean;
}
